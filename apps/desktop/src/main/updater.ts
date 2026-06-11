import { app, shell } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';

import type { UpdaterStatePayload } from '@stitch/shared/ipc/types';

const NETWORK_ERROR_CODES = [
  'ERR_INTERNET_DISCONNECTED',
  'ERR_NETWORK_CHANGED',
  'ERR_NETWORK_IO_SUSPENDED',
  'ERR_NAME_NOT_RESOLVED',
  'ERR_CONNECTION_REFUSED',
  'ERR_CONNECTION_TIMED_OUT',
  'ENOTFOUND',
  'ECONNREFUSED',
];

const RELEASES_URL = 'https://github.com/UseStitch/stitch/releases/latest';

function isNetworkError(error: Error): boolean {
  return NETWORK_ERROR_CODES.some((code) => error.message.includes(code));
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
    await shell.openExternal(RELEASES_URL);
    await options.prepareForInstall();
    app.quit();
    return true;
  }

  return { init, checkForUpdates, getState, onEvent, installUpdate, openManualUpdateAndQuit };
}
