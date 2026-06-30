import { app, dialog, session, type BrowserWindow } from 'electron';

import { ElectronBrowserManager } from './browser/browser-manager.js';
import { registerBrowserHandlers } from './ipc/browser.js';
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
  startMeetingDetection,
  stopMeetingDetection,
  dismissMeetingDetection,
} from './meeting-detection.js';
import {
  destroyNotificationWindow,
  dismissDesktopNotification,
  registerNotificationHandlers,
  showDesktopNotification,
} from './notifications.js';
import { stopRecordingCapture } from './recording-capture.js';
import { readServerConnectionConfig, type ServerConnectionConfig } from './server-config.js';
import { findAvailablePort, killServer, spawnServer } from './sidecar.js';
import { destroyTray, initTray } from './tray.js';
import { createUpdater } from './updater.js';
import { createWindow } from './window.js';

const DEV_APP_NAME = 'stitch-dev';
const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1_000;

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
let browserManager: ElectronBrowserManager | null = null;
let browserBridgePort = 0;

// Shared mutable server state — passed by reference to IPC handlers that own it.
const serverState = {
  serverUrl: '',
  serverConnectionConfig: { mode: 'local', remoteUrl: null } as ServerConnectionConfig,
};

async function startLocalServer(): Promise<string> {
  return spawnServer({ STITCH_BROWSER_BRIDGE_PORT: String(browserBridgePort) });
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
  browserManager?.stopBridge();
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
  if (browserManager) registerBrowserHandlers(browserManager);
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
  dismissMeetingDetection(key);
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
    browserBridgePort = await findAvailablePort();
    browserManager = new ElectronBrowserManager(() => mainWindow);
    browserManager.startBridge(browserBridgePort);
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
    browserManager?.persistToDisk();
    void session
      .fromPartition('persist:stitch-browser')
      .cookies.flushStore()
      .then(() => shutdownRuntime())
      .then(() => app.quit());
  }
});

// The tray keeps the app alive even when the window is hidden.
// Actual quit is handled via tray "Quit" or app.quit().
app.on('window-all-closed', () => {
  // No-op: prevent default quit behavior on all platforms.
});
