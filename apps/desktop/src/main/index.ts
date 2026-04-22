import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  Notification,
  shell,
  systemPreferences,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveResourcePath } from './resources';
import { findAvailablePort, killServer, spawnServer } from './sidecar';
import { destroyTray, initTray } from './tray';
import { createUpdater } from './updater';

const WEB_DEV_URL = 'http://localhost:5173';
const WINDOW_ICON_NAME = 'icon.png';
const DEV_SERVER_POLL_MS = 200;
const DEV_SERVER_TIMEOUT_MS = 30_000;
const DEV_APP_NAME = 'stitch-dev';
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1_000;

/**
 * With adhoc code signing, macOS ties TCC permissions to the exact code signature hash.
 * After an app update the hash changes but old TCC entries remain, causing permissions
 * to appear granted in System Settings while being silently rejected at runtime.
 * This detects version changes and resets TCC so macOS will re-prompt.
 */
async function resetTccPermissionsIfVersionChanged(): Promise<boolean> {
  if (process.platform !== 'darwin' || !app.isPackaged) return false;

  const versionFile = join(app.getPath('userData'), '.last-tcc-version');
  const currentVersion = app.getVersion();

  try {
    const lastVersion = (await readFile(versionFile, 'utf-8')).trim();
    if (lastVersion === currentVersion) return false;
  } catch {
    // File doesn't exist — first run or upgrade from before this logic
  }

  const { execSync } = await import('node:child_process');
  const bundleId = 'com.stitch.desktop';

  for (const service of ['Microphone', 'ScreenCapture']) {
    try {
      execSync(`tccutil reset ${service} ${bundleId}`, { timeout: 5_000 });
    } catch {
      // tccutil may fail if no entry exists
    }
  }

  await mkdir(join(app.getPath('userData')), { recursive: true });
  await writeFile(versionFile, currentVersion, 'utf-8');

  return true;
}

function configureAppIdentityForEnvironment(): void {
  if (app.isPackaged) {
    return;
  }

  app.setName('Stitch Dev');
  app.setPath('userData', join(app.getPath('appData'), DEV_APP_NAME));
}

function getPackagedWebDistPath(): string {
  return join(process.resourcesPath, 'web/dist/index.html');
}

// Enforce single instance before any other initialization.
// app.exit() is used instead of app.quit() to avoid ghost processes on Windows.
configureAppIdentityForEnvironment();
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let serverUrl: string | null = null;
let isQuitting = false;
let isShuttingDown = false;

async function shutdownRuntime(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  destroyTray();
  await killServer();
}

const updater = createUpdater({
  getWindow: () => mainWindow,
  prepareForInstall: async () => {
    isQuitting = true;
    await shutdownRuntime();
  },
});

async function waitForDevServer(url: string): Promise<void> {
  const deadline = Date.now() + DEV_SERVER_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return;
    } catch {
      // server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, DEV_SERVER_POLL_MS));
  }

  throw new Error(`Dev server at ${url} failed to start within ${DEV_SERVER_TIMEOUT_MS}ms`);
}

async function createWindow() {
  const isMac = process.platform === 'darwin';
  const iconCandidates = process.platform === 'win32' ? ['icon.png', 'icon.ico'] : ['icon.png'];
  const windowIcon = iconCandidates
    .map((name) => nativeImage.createFromPath(resolveResourcePath(name)))
    .find((image) => !image.isEmpty());

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    ...(windowIcon ? { icon: windowIcon } : { icon: resolveResourcePath(WINDOW_ICON_NAME) }),
    frame: false,
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : {}),
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (windowIcon) {
    mainWindow.setIcon(windowIcon);
  }

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      dialog.showErrorBox(
        'Failed to load Stitch UI',
        `errorCode=${errorCode}\nerror=${errorDescription}\nurl=${validatedURL}`,
      );
    },
  );

  // Hide to tray on close instead of quitting, unless the app is actually quitting.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.on('context-menu', (_e, params) => {
    mainWindow?.webContents.send('context-menu', {
      x: params.x,
      y: params.y,
      misspelledWord: params.misspelledWord,
      dictionarySuggestions: params.dictionarySuggestions,
      selectionText: params.selectionText,
      isEditable: params.isEditable,
      editFlags: params.editFlags,
    });
  });

  mainWindow.on('enter-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', true);
  });

  mainWindow.on('leave-full-screen', () => {
    mainWindow?.webContents.send('window:fullscreen-changed', false);
  });

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    await waitForDevServer(process.env['ELECTRON_RENDERER_URL']);
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else if (!app.isPackaged) {
    await waitForDevServer(WEB_DEV_URL);
    void mainWindow.loadURL(WEB_DEV_URL);
  } else {
    void mainWindow.loadFile(getPackagedWebDistPath());
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
}

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.handle('window:close', () => {
  // Hide to tray instead of closing so notifications and tray keep working
  mainWindow?.hide();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.handle('window:isFullScreen', () => {
  return mainWindow?.isFullScreen() ?? false;
});

ipcMain.handle('get-server-config', () => ({ url: serverUrl }));

ipcMain.handle('devtools:toggle', () => {
  mainWindow?.webContents.toggleDevTools();
});

ipcMain.handle('devtools:inspect', (_event, x: number, y: number) => {
  mainWindow?.webContents.inspectElement(x, y);
});

ipcMain.handle('spellcheck:replaceMisspelling', (_event, word: string) => {
  mainWindow?.webContents.replaceMisspelling(word);
});

ipcMain.handle('spellcheck:addToDictionary', (_event, word: string) => {
  mainWindow?.webContents.session.addWordToSpellCheckerDictionary(word);
});

ipcMain.handle('shell:openExternal', (_event, url: string) => {
  void shell.openExternal(url);
});

ipcMain.handle('files:writeTmp', async (_event, data: ArrayBuffer, ext: string) => {
  const dir = join(tmpdir(), 'stitch-paste');
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  const filePath = join(dir, filename);
  await writeFile(filePath, Buffer.from(data));
  return filePath;
});

ipcMain.handle('dialog:openPath', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'openDirectory', 'multiSelections'],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('permissions:requestMicrophone', async () => {
  if (process.platform !== 'darwin') return true;
  return systemPreferences.askForMediaAccess('microphone');
});

ipcMain.handle('permissions:getScreenCaptureStatus', () => {
  if (process.platform !== 'darwin') return 'granted';
  return systemPreferences.getMediaAccessStatus('screen');
});

ipcMain.handle('permissions:openScreenCaptureSettings', () => {
  if (process.platform === 'darwin') {
    void shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
    );
  }
});

ipcMain.handle(
  'notifications:show',
  (
    _event,
    input:
      | {
          title: string;
          body?: string;
          silent?: boolean;
          clickAction?: {
            kind: 'start-recording';
            platform: 'google-meet' | 'teams' | 'zoom' | 'slack' | 'discord';
            key: string;
          } | null;
        }
      | null
      | undefined,
  ): boolean => {
    if (!Notification.isSupported()) return false;
    if (!input || typeof input.title !== 'string' || input.title.trim().length === 0) {
      return false;
    }

    const notification = new Notification({
      title: input.title,
      body: input.body,
      silent: input.silent,
    });

    notification.on('click', () => {
      if (input.clickAction && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('notification:click-action', input.clickAction);
      }

      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.show();
      mainWindow.focus();
    });

    notification.show();
    return true;
  },
);

ipcMain.handle('updater:check', () => {
  return updater.checkForUpdates();
});

ipcMain.handle('updater:getState', () => {
  return updater.getState();
});

ipcMain.handle('updater:install', () => {
  return updater.installUpdate();
});

void app.whenReady().then(async () => {
  try {
    // Register launch at startup for packaged builds only.
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true });
    }

    // When a second instance attempts to launch, focus the existing window.
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });

    const port = await findAvailablePort();
    serverUrl = await spawnServer(port);

    const permissionsWereReset = await resetTccPermissionsIfVersionChanged();

    await createWindow();

    if (permissionsWereReset && mainWindow) {
      void dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Permissions Required',
        message: 'Stitch was updated and needs audio permissions re-granted.',
        detail:
          'When you start a recording, you will be prompted to grant microphone access. You may also need to enable Stitch under "System Audio Recording Only" in System Settings > Privacy & Security.',
        buttons: ['OK'],
      });
    }

    if (process.platform !== 'darwin') {
      updater.init();
      setTimeout(() => {
        void updater.checkForUpdates();
      }, 15_000);
      setInterval(() => {
        void updater.checkForUpdates();
      }, UPDATE_CHECK_INTERVAL_MS);
    }

    // Initialize system tray
    const getWindow = () => mainWindow;
    initTray(getWindow);

    app.on('activate', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        void createWindow();
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
