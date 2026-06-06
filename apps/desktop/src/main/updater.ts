import { app, shell } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type { UpdaterStatePayload } from './ipc-types.js';

const NETWORK_ERROR_CODES = [
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NETWORK_CHANGED',
  'ERR_NAME_NOT_RESOLVED',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_TIMED_OUT',
  'ENOTFOUND',
  'ECONNREFUSED',
];

const RELEASES_URL = 'https://github.com/UseStitch/stitch/releases/latest';
const RELEASE_DOWNLOAD_BASE_URL = 'https://github.com/UseStitch/stitch/releases/latest/download';

function isNetworkError(error: Error): boolean {
  return NETWORK_ERROR_CODES.some((code) => error.message.includes(code));
}

async function downloadLatestMacDmg(): Promise<string> {
  const downloadsDir = app.getPath('downloads');
  await mkdir(downloadsDir, { recursive: true });

  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const fileName = `Stitch-macos-${arch}.dmg`;
  const filePath = path.join(downloadsDir, fileName);
  const partialPath = `${filePath}.download`;
  const downloadUrl = `${RELEASE_DOWNLOAD_BASE_URL}/${fileName}`;

  const response = await fetch(downloadUrl, {
    headers: { 'User-Agent': 'Stitch Desktop' },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${fileName}: ${response.status} ${response.statusText}`);
  }
  if (!response.body) {
    throw new Error(`Failed to download ${fileName}: response body was empty`);
  }

  await rm(partialPath, { force: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partialPath));
  await rename(partialPath, filePath);

  return filePath;
}

type UpdaterOptions = {
  prepareForInstall: () => void | Promise<void>;
};

export function createUpdater(options: UpdaterOptions) {
  let initialized = false;
  let state: UpdaterStatePayload = { status: 'idle' };
  let eventListener: ((state: UpdaterStatePayload) => void) | null = null;

  function emit(next: UpdaterStatePayload): void {
    state = next;
    eventListener?.(state);
  }

  function toVersionState(
    status: UpdaterStatePayload['status'],
    info: UpdateInfo,
  ): UpdaterStatePayload {
    return { status, version: info.version };
  }

  function toDownloadingState(progress: ProgressInfo): UpdaterStatePayload {
    return { status: 'downloading', version: state.version, progress: progress.percent };
  }

  function init(): void {
    if (initialized) return;
    initialized = true;

    if (!app.isPackaged) {
      emit({ status: 'idle' });
      return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('checking-for-update', () => emit({ status: 'checking' }));
    autoUpdater.on('update-available', (info) => emit(toVersionState('available', info)));
    autoUpdater.on('download-progress', (progress) => emit(toDownloadingState(progress)));
    autoUpdater.on('update-downloaded', (info) => emit(toVersionState('downloaded', info)));
    autoUpdater.on('update-not-available', (info) => emit(toVersionState('no-update', info)));
    autoUpdater.on('error', (error) => {
      emit(isNetworkError(error) ? { status: 'idle' } : { status: 'error', error: error.message });
    });
  }

  async function checkForUpdates(): Promise<UpdaterStatePayload> {
    if (!app.isPackaged) {
      emit({ status: 'idle' });
      return state;
    }

    try {
      await autoUpdater.checkForUpdates();
      return state;
    } catch (error) {
      if (error instanceof Error && isNetworkError(error)) {
        emit({ status: 'idle' });
        return state;
      }
      const message = error instanceof Error ? error.message : String(error);
      emit({ status: 'error', error: message });
      return state;
    }
  }

  function getState(): UpdaterStatePayload {
    return state;
  }

  function onEvent(listener: (state: UpdaterStatePayload) => void): void {
    eventListener = listener;
  }

  async function installUpdate(): Promise<boolean> {
    if (!app.isPackaged || state.status !== 'downloaded') {
      return false;
    }

    await options.prepareForInstall();
    autoUpdater.quitAndInstall(false, true);
    return true;
  }

  async function openManualUpdateAndQuit(): Promise<boolean> {
    const filePath = process.platform === 'darwin' ? await downloadLatestMacDmg() : null;

    if (filePath) {
      const error = await shell.openPath(filePath);
      if (error) throw new Error(error);
    } else {
      await shell.openExternal(RELEASES_URL);
    }

    await options.prepareForInstall();
    app.quit();
    return true;
  }

  return { init, checkForUpdates, getState, onEvent, installUpdate, openManualUpdateAndQuit };
}
