import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initNotifications } from './notifications';
import { resolveResourcePath } from './resources';
import { findAvailablePort, killServer, spawnServer } from './sidecar';
import { SseClient } from './sse-client';
import { destroyTray, initTray } from './tray';

const WEB_DEV_URL = 'http://localhost:5173';
const WINDOW_ICON_NAME = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
const DEV_SERVER_POLL_MS = 200;
const DEV_SERVER_TIMEOUT_MS = 30_000;

function getPackagedWebDistPath(): string {
  return join(process.resourcesPath, 'web/dist/index.html');
}

// Enforce single instance before any other initialization.
// app.exit() is used instead of app.quit() to avoid ghost processes on Windows.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit(0);
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.stitch.desktop');
}

let mainWindow: BrowserWindow | null = null;
let serverUrl: string | null = null;
let sseClient: SseClient | null = null;
let isQuitting = false;

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

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: resolveResourcePath(WINDOW_ICON_NAME),
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

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    dialog.showErrorBox(
      'Failed to load Stitch UI',
      `errorCode=${errorCode}\nerror=${errorDescription}\nurl=${validatedURL}`,
    );
  });

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

    await createWindow();

    // Initialize SSE client, notifications, and system tray
    const getWindow = () => mainWindow;
    sseClient = new SseClient(serverUrl);
    initNotifications(sseClient, serverUrl, getWindow);
    initTray(sseClient, serverUrl, getWindow);
    sseClient.start();

    app.on('activate', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        void createWindow();
      }
    });
  } catch (error) {
    sseClient?.stop();
    destroyTray();
    killServer();
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    dialog.showErrorBox('Stitch failed to start', detail);
    app.exit(1);
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  sseClient?.stop();
  destroyTray();
  killServer();
});

// The tray keeps the app alive even when the window is hidden.
// Actual quit is handled via tray "Quit" or app.quit().
app.on('window-all-closed', () => {
  // No-op: prevent default quit behavior on all platforms.
});
