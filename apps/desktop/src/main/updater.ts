import { app } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';

import type { BrowserWindow } from 'electron';

type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'no-update'
  | 'error';

type UpdaterState = {
  status: UpdaterStatus;
  version?: string;
  progress?: number;
  error?: string;
};

type UpdaterOptions = {
  getWindow: () => BrowserWindow | null;
  prepareForInstall: () => void;
};

const UPDATER_EVENT_CHANNEL = 'updater:event';

export function createUpdater(options: UpdaterOptions) {
  let initialized = false;
  let state: UpdaterState = { status: 'idle' };

  function emit(next: UpdaterState): void {
    state = next;
    const win = options.getWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send(UPDATER_EVENT_CHANNEL, state);
  }

  function toVersionState(status: UpdaterStatus, info: UpdateInfo): UpdaterState {
    return { status, version: info.version };
  }

  function toDownloadingState(progress: ProgressInfo): UpdaterState {
    return {
      status: 'downloading',
      version: state.version,
      progress: progress.percent,
    };
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

    autoUpdater.on('checking-for-update', () => {
      emit({ status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
      emit(toVersionState('available', info));
    });

    autoUpdater.on('download-progress', (progress) => {
      emit(toDownloadingState(progress));
    });

    autoUpdater.on('update-downloaded', (info) => {
      emit(toVersionState('downloaded', info));
    });

    autoUpdater.on('update-not-available', (info) => {
      emit(toVersionState('no-update', info));
    });

    autoUpdater.on('error', (error) => {
      emit({ status: 'error', error: error.message });
    });
  }

  async function checkForUpdates(): Promise<UpdaterState> {
    if (!app.isPackaged) {
      emit({ status: 'idle' });
      return state;
    }

    try {
      await autoUpdater.checkForUpdates();
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit({ status: 'error', error: message });
      return state;
    }
  }

  function getState(): UpdaterState {
    return state;
  }

  function installUpdate(): boolean {
    if (!app.isPackaged || state.status !== 'downloaded') {
      return false;
    }

    options.prepareForInstall();
    autoUpdater.quitAndInstall(false, true);
    return true;
  }

  return {
    init,
    checkForUpdates,
    getState,
    installUpdate,
  };
}
