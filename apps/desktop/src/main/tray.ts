import { app, Menu, nativeImage, Tray } from 'electron';

import { resolveResourcePath } from './resources';
import type { BrowserWindow } from 'electron';

let tray: Tray | null = null;

function getAppIcon(): Electron.NativeImage {
  const iconPath = resolveResourcePath('icon.png');
  const image = nativeImage.createFromPath(iconPath);
  return image.resize({ width: 16, height: 16 });
}

function focusWindow(getWindow: () => BrowserWindow | null): void {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function buildContextMenu(getWindow: () => BrowserWindow | null): Electron.Menu {
  return Menu.buildFromTemplate([
    {
      label: 'Open Stitch',
      click: () => focusWindow(getWindow),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ]);
}

export function initTray(getWindow: () => BrowserWindow | null): void {
  tray = new Tray(getAppIcon());
  tray.setToolTip('Stitch');
  tray.setContextMenu(buildContextMenu(getWindow));

  tray.on('click', () => {
    focusWindow(getWindow);
  });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
