import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findAvailablePort, killServer, spawnServer } from './sidecar';

const WEB_DEV_URL = 'http://localhost:5173';
const WEB_DIST = join(__dirname, '../../web/dist/index.html');
const DEV_SERVER_POLL_MS = 200;
const DEV_SERVER_TIMEOUT_MS = 30_000;

// Enforce single instance before any other initialization.
// app.exit() is used instead of app.quit() to avoid ghost processes on Windows.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let serverUrl: string | null = null;

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

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    await waitForDevServer(process.env['ELECTRON_RENDERER_URL']);
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else if (!app.isPackaged) {
    await waitForDevServer(WEB_DEV_URL);
    void mainWindow.loadURL(WEB_DEV_URL);
  } else {
    void mainWindow.loadFile(WEB_DIST);
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
  mainWindow?.close();
});

ipcMain.handle('window:isMaximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.handle('get-server-config', () => ({ url: serverUrl }));

ipcMain.handle('devtools:toggle', () => {
  mainWindow?.webContents.toggleDevTools();
});

ipcMain.handle('devtools:inspect', (_event, x: number, y: number) => {
  mainWindow?.webContents.inspectElement(x, y);
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('before-quit', () => {
  killServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    killServer();
    app.quit();
  }
});
