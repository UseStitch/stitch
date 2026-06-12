import { app, dialog, type BrowserWindow } from 'electron';

import { registerDevtoolsHandlers } from './ipc/devtools.js';
import { registerFilesHandlers } from './ipc/files.js';
import { registerPermissionsHandlers } from './ipc/permissions.js';
import { registerRecordingHandlers } from './ipc/recording.js';
import { registerIpcHandler } from './ipc/register.js';
import { registerServerHandlers } from './ipc/server.js';
import { registerShellHandlers } from './ipc/shell.js';
import { registerSpellcheckHandlers } from './ipc/spellcheck.js';
import { registerUpdaterHandlers } from './ipc/updater.js';
import { registerWindowHandlers } from './ipc/window.js';
import {
  configureMeetingDetectionEnv,
  startMeetingDetection,
  stopMeetingDetection,
} from './meeting-detection.js';
import {
  destroyNotificationWindow,
  dismissDesktopNotification,
  registerNotificationHandlers,
  showDesktopNotification,
} from './notifications.js';
import { configureRecordingCaptureEnv, stopRecordingCapture } from './recording-capture.js';
import { readServerConnectionConfig, type ServerConnectionConfig } from './server-config.js';
import { findAvailablePort, killServer, spawnServer } from './sidecar.js';
import { resetTccPermissionsIfVersionChanged } from './tcc-permissions.js';
import { destroyTray, initTray } from './tray.js';
import { createUpdater } from './updater.js';
import { createWindow } from './window.js';

const DEV_APP_NAME = 'stitch-dev';
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000;

function configureAppIdentityForEnvironment(): void {
  if (app.isPackaged) return;
  app.setName('Stitch Dev');
  app.setPath('userData', app.getPath('appData') + '/' + DEV_APP_NAME);
}

// Enforce single instance before any other initialization.
// app.exit() is used instead of app.quit() to avoid ghost processes on Windows.
configureAppIdentityForEnvironment();
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let isShuttingDown = false;
let updateCheckInterval: NodeJS.Timeout | null = null;

// Shared mutable server state — passed by reference to IPC handlers that own it.
const serverState = {
  serverUrl: '',
  serverConnectionConfig: { mode: 'local', remoteUrl: null } as ServerConnectionConfig,
};

async function startLocalServer(): Promise<string> {
  const port = await findAvailablePort();
  return spawnServer(port);
}

async function resolveServerUrl(): Promise<string> {
  serverState.serverConnectionConfig = await readServerConnectionConfig();

  if (
    serverState.serverConnectionConfig.mode === 'remote' &&
    serverState.serverConnectionConfig.remoteUrl
  ) {
    return serverState.serverConnectionConfig.remoteUrl;
  }

  serverState.serverConnectionConfig = {
    mode: 'local',
    remoteUrl: serverState.serverConnectionConfig.remoteUrl,
  };
  return startLocalServer();
}

async function shutdownRuntime(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
  destroyTray();
  destroyNotificationWindow();
  stopMeetingDetection();
  await stopRecordingCapture().catch(() => null);
  await killServer();
}

const updater = createUpdater({
  prepareForInstall: async () => {
    isQuitting = true;
    await shutdownRuntime();
  },
});

function registerAllIpcHandlers(): void {
  const getWindow = () => mainWindow;
  const getServerUrl = () => serverState.serverUrl;

  registerWindowHandlers(getWindow);
  registerDevtoolsHandlers(getWindow);
  registerSpellcheckHandlers(getWindow);
  registerShellHandlers();
  registerFilesHandlers();
  registerPermissionsHandlers();
  registerRecordingHandlers(getServerUrl, getWindow);
  registerServerHandlers(serverState, startLocalServer, getWindow);
  registerUpdaterHandlers(updater, getWindow);
  registerNotificationHandlers((event) => {
    if (event.type === 'meeting-detected') {
      dismissMeetingCall(event.payload.key);
    }
  });
  registerIpcHandler('meeting:call-dismiss', (_event, key) => {
    dismissMeetingCall(key);
  });
}

function dismissMeetingCall(key: string): void {
  mainWindow?.webContents.send('meeting:call-dismissed', { key });
  dismissDesktopNotification(`meeting:${key}`);
}

function onContextMenu(params: Electron.ContextMenuParams): void {
  mainWindow?.webContents.send('context-menu', {
    x: params.x,
    y: params.y,
    misspelledWord: params.misspelledWord,
    dictionarySuggestions: params.dictionarySuggestions,
    selectionText: params.selectionText,
    isEditable: params.isEditable,
    editFlags: params.editFlags,
  });
}

async function spawnMainWindow(): Promise<BrowserWindow> {
  return createWindow(onContextMenu, () => {
    if (isQuitting) return 'allow';
    mainWindow?.hide();
    return 'prevent';
  });
}

void app.whenReady().then(async () => {
  try {
    configureMeetingDetectionEnv();
    configureRecordingCaptureEnv();

    registerAllIpcHandlers();

    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true });
    }

    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    serverState.serverUrl = await resolveServerUrl();

    const permissionsWereReset = await resetTccPermissionsIfVersionChanged();

    mainWindow = await spawnMainWindow();
    startMeetingDetection(
      () => mainWindow,
      (payload) => {
        void showDesktopNotification({
          id: `meeting:${payload.key}`,
          type: 'meeting-detected',
          createdAt: Date.now(),
          autoDismissMs: null,
          payload,
        });
      },
      (payload) => {
        dismissDesktopNotification(`meeting:${payload.key}`);
      },
    );

    if (permissionsWereReset) {
      void dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Permissions Required',
        message: 'Stitch was updated and needs audio permissions re-granted.',
        detail:
          'When you start a recording, you will be prompted to grant microphone access. You may also need to enable Stitch under "System Audio Recording Only" in System Settings > Privacy & Security.',
        buttons: ['OK'],
      });
    }

    updater.init();
    setTimeout(() => void updater.checkForUpdates(), 15_000);
    updateCheckInterval = setInterval(
      () => void updater.checkForUpdates(),
      UPDATE_CHECK_INTERVAL_MS,
    );

    initTray(() => mainWindow);

    app.on('activate', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        void spawnMainWindow().then((win) => {
          mainWindow = win;
        });
      }
    });
  } catch (error) {
    await shutdownRuntime();
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    dialog.showErrorBox('Stitch failed to start', detail);
    app.exit(1);
  }
});

app.on('before-quit', (event) => {
  isQuitting = true;
  if (!isShuttingDown) {
    event.preventDefault();
    void shutdownRuntime().then(() => app.quit());
  }
});

// The tray keeps the app alive even when the window is hidden.
// Actual quit is handled via tray "Quit" or app.quit().
app.on('window-all-closed', () => {
  // No-op: prevent default quit behavior on all platforms.
});
