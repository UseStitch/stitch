import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { findAvailablePort, killServer, spawnServer } from './sidecar';

const WEB_DEV_URL = 'http://localhost:5173';
const WEB_DIST = join(__dirname, '../../web/dist/index.html');
const DEV_SERVER_POLL_MS = 200;
const DEV_SERVER_TIMEOUT_MS = 30_000;

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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    await waitForDevServer(process.env['ELECTRON_RENDERER_URL']);
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else if (!app.isPackaged) {
    await waitForDevServer(WEB_DEV_URL);
    mainWindow.loadURL(WEB_DEV_URL);
  } else {
    mainWindow.loadFile(WEB_DIST);
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

app.whenReady().then(async () => {
  const port = await findAvailablePort();
  serverUrl = await spawnServer(port);

  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
