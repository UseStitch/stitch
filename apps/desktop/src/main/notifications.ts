import { app, BrowserWindow, screen, shell } from 'electron';
import { join } from 'node:path';

import type { DesktopNotificationEvent } from '@stitch/shared/ipc/types';

import { registerIpcHandler } from './ipc/register.js';
import { loadRendererWindow } from './window.js';

const NOTIFICATION_HASH = '/desktop-notifications';
const NOTIFICATION_WIDTH = 360;
const NOTIFICATION_DEFAULT_HEIGHT = 92;
const NOTIFICATION_MARGIN = 16;
const NOTIFICATION_GAP = 8;
const EXIT_ANIMATION_MS = 220;
const FOLLOW_CURSOR_ENABLED = true;
const FOLLOW_CURSOR_DWELL_MS = 1500;
const FOLLOW_CURSOR_POLL_INTERVAL_MS = 250;

type NotificationEntry = {
  event: DesktopNotificationEvent;
  win: BrowserWindow;
  height: number;
  destroyTimer: NodeJS.Timeout | null;
};

const entries = new Map<string, NotificationEntry>();
const orderedIds: string[] = [];
let displayId: number | null = null;
let candidateDisplayId: number | null = null;
let candidateDisplaySince = 0;
let followCursorInterval: NodeJS.Timeout | null = null;
let screenListenersRegistered = false;

function getCursorDisplay(): Electron.Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function getActiveDisplay(): Electron.Display {
  const cursorDisplay = getCursorDisplay();
  if (displayId === null) {
    displayId = cursorDisplay.id;
  }

  return screen.getAllDisplays().find((display) => display.id === displayId) ?? cursorDisplay;
}

function resetActiveDisplay(): void {
  displayId = getCursorDisplay().id;
  candidateDisplayId = null;
  candidateDisplaySince = 0;
}

function getBounds(display: Electron.Display, stackIndex: number, height: number): Electron.Rectangle {
  const previousHeight = orderedIds.slice(0, stackIndex).reduce((total, id) => {
    const entry = entries.get(id);
    return total + (entry?.height ?? NOTIFICATION_DEFAULT_HEIGHT) + NOTIFICATION_GAP;
  }, 0);

  return {
    width: NOTIFICATION_WIDTH,
    height,
    x: display.workArea.x + display.workArea.width - NOTIFICATION_WIDTH - NOTIFICATION_MARGIN,
    y: display.workArea.y + display.workArea.height - height - NOTIFICATION_MARGIN - previousHeight,
  };
}

function relayoutNotifications(): void {
  if (entries.size === 0) return;

  const display = getActiveDisplay();

  orderedIds.forEach((id, index) => {
    const entry = entries.get(id);
    if (!entry || entry.win.isDestroyed()) return;

    entry.win.setBounds(getBounds(display, index, entry.height), false);
    entry.win.showInactive();
  });
}

function stopFollowCursorPolling(): void {
  if (followCursorInterval) {
    clearInterval(followCursorInterval);
  }

  followCursorInterval = null;
  candidateDisplayId = null;
  candidateDisplaySince = 0;
}

function pollCursorDisplay(): void {
  if (entries.size === 0) {
    stopFollowCursorPolling();
    return;
  }

  const cursorDisplay = getCursorDisplay();
  if (displayId === null) {
    displayId = cursorDisplay.id;
    return;
  }

  if (cursorDisplay.id === displayId) {
    candidateDisplayId = null;
    candidateDisplaySince = 0;
    return;
  }

  if (cursorDisplay.id !== candidateDisplayId) {
    candidateDisplayId = cursorDisplay.id;
    candidateDisplaySince = Date.now();
    return;
  }

  if (Date.now() - candidateDisplaySince < FOLLOW_CURSOR_DWELL_MS) return;

  displayId = cursorDisplay.id;
  candidateDisplayId = null;
  candidateDisplaySince = 0;
  relayoutNotifications();
}

function startFollowCursorPolling(): void {
  if (!FOLLOW_CURSOR_ENABLED || followCursorInterval) return;

  followCursorInterval = setInterval(pollCursorDisplay, FOLLOW_CURSOR_POLL_INTERVAL_MS);
}

function removeOrderedId(id: string): void {
  const index = orderedIds.indexOf(id);
  if (index !== -1) {
    orderedIds.splice(index, 1);
  }
}

function destroyNotification(id: string): void {
  const entry = entries.get(id);
  if (!entry) return;

  if (entry.destroyTimer) {
    clearTimeout(entry.destroyTimer);
  }
  entries.delete(id);
  removeOrderedId(id);

  if (!entry.win.isDestroyed()) {
    entry.win.destroy();
  }

  if (entries.size === 0) {
    displayId = null;
    stopFollowCursorPolling();
    return;
  }

  relayoutNotifications();
}

function animateOutNotification(id: string): void {
  const entry = entries.get(id);
  if (!entry || entry.destroyTimer) return;

  if (!entry.win.isDestroyed()) {
    entry.win.webContents.send('notifications:dismissed', id);
  }

  entry.destroyTimer = setTimeout(() => destroyNotification(id), EXIT_ANIMATION_MS);
}

function registerScreenListeners(): void {
  if (screenListenersRegistered) return;
  screenListenersRegistered = true;

  screen.on('display-metrics-changed', () => {
    relayoutNotifications();
  });
  screen.on('display-removed', (_event, display) => {
    if (display.id === displayId) {
      resetActiveDisplay();
    }

    if (display.id === candidateDisplayId) {
      candidateDisplayId = null;
      candidateDisplaySince = 0;
    }

    relayoutNotifications();
  });
}

function createNotificationWindow(event: DesktopNotificationEvent): BrowserWindow {
  const display = getActiveDisplay();
  const stackIndex = orderedIds.length;
  const win = new BrowserWindow({
    ...getBounds(display, stackIndex, NOTIFICATION_DEFAULT_HEIGHT),
    title: 'Notification',
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    focusable: false,
    hiddenInMissionControl: true,
    roundedCorners: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -15, y: -16 },
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => {
    relayoutNotifications();
    win.showInactive();
  });

  win.on('closed', () => {
    const entry = entries.get(event.id);
    if (entry?.win !== win) return;

    entries.delete(event.id);
    removeOrderedId(event.id);

    if (entries.size === 0) {
      displayId = null;
      stopFollowCursorPolling();
      return;
    }

    relayoutNotifications();
  });

  return win;
}

export function registerNotificationHandlers(onDismiss?: (event: DesktopNotificationEvent) => void): void {
  registerScreenListeners();

  registerIpcHandler('notifications:dismiss', (_event, id) => {
    const entry = entries.get(id);
    if (entry) {
      onDismiss?.(entry.event);
    }
    animateOutNotification(id);
  });

  registerIpcHandler('notifications:set-height', (event, height) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;

    const entry = [...entries.values()].find((item) => item.win === win);
    if (!entry) return;

    entry.height = Math.max(1, Math.ceil(height));
    relayoutNotifications();
  });
}

export async function showDesktopNotification(event: DesktopNotificationEvent): Promise<void> {
  if (entries.has(event.id)) return;

  const win = createNotificationWindow(event);
  entries.set(event.id, { event, win, height: NOTIFICATION_DEFAULT_HEIGHT, destroyTimer: null });
  orderedIds.push(event.id);
  startFollowCursorPolling();

  const notification = encodeURIComponent(JSON.stringify(event));
  await loadRendererWindow(win, `${NOTIFICATION_HASH}?notification=${notification}`);
}

export function dismissDesktopNotification(id: string): void {
  animateOutNotification(id);
}

export function destroyNotificationWindow(): void {
  while (orderedIds.length > 0) {
    const id = orderedIds[0];
    if (!id) return;
    destroyNotification(id);
  }
}
