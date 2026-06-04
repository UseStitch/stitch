import { app, dialog, nativeImage, shell, BrowserWindow } from 'electron';
import { join } from 'node:path';

import { resolveResourcePath } from './resources.js';

const WEB_DEV_URL = 'http://localhost:5173';
const WINDOW_ICON_NAME = 'icon.png';
const DEV_SERVER_POLL_MS = 200;
const DEV_SERVER_TIMEOUT_MS = 30_000;

function getPackagedWebDistPath(): string {
  return join(process.resourcesPath, 'web/dist/index.html');
}

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

function resolveWindowIcon(): Electron.NativeImage | undefined {
  const candidates = process.platform === 'win32' ? ['icon.png', 'icon.ico'] : ['icon.png'];
  return candidates
    .map((name) => nativeImage.createFromPath(resolveResourcePath(name)))
    .find((image) => !image.isEmpty());
}

export async function createWindow(
  onContextMenu: (params: Electron.ContextMenuParams) => void,
  onClose: () => void,
): Promise<BrowserWindow> {
  const isMac = process.platform === 'darwin';
  const windowIcon = resolveWindowIcon();

  const win = new BrowserWindow({
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

  if (windowIcon) {
    win.setIcon(windowIcon);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    dialog.showErrorBox(
      'Failed to load Stitch UI',
      `errorCode=${errorCode}\nerror=${errorDescription}\nurl=${validatedURL}`,
    );
  });

  win.on('close', (event) => {
    event.preventDefault();
    onClose();
  });

  win.webContents.on('context-menu', (_e, params) => {
    onContextMenu(params);
  });

  win.on('enter-full-screen', () => {
    win.webContents.send('window:fullscreen-changed', true);
  });

  win.on('leave-full-screen', () => {
    win.webContents.send('window:fullscreen-changed', false);
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'] ?? WEB_DEV_URL;
  if (!app.isPackaged) {
    await waitForDevServer(devUrl);
    void win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    void win.loadFile(getPackagedWebDistPath());
  }

  return win;
}
