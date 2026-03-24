import { app, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';

import type { BrowserWindow } from 'electron';

import type { SseClient } from './sse-client';

type TrayState = 'idle' | 'detected' | 'recording';

let tray: Tray | null = null;
let currentState: TrayState = 'idle';
let detectedMeetingId: string | null = null;

function getAppIconPath(): string {
  return join(__dirname, '../../resources/icon.png');
}

function createRecordingIcon(): Electron.NativeImage {
  // Minimal 16x16 red circle PNG encoded as base64.
  // Generated from a solid red (#DC2626) anti-aliased circle on transparent background.
  const SIZE = 16;
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R = SIZE / 2 - 1;

  // Build raw RGBA pixel data then encode as a minimal PNG.
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const offset = (y * SIZE + x) * 4;
      const dist = Math.sqrt((x - CX) ** 2 + (y - CY) ** 2);
      if (dist <= R) {
        const alpha = Math.min(1, R - dist) * 255;
        pixels[offset] = 220;
        pixels[offset + 1] = 38;
        pixels[offset + 2] = 38;
        pixels[offset + 3] = Math.round(alpha);
      }
    }
  }

  // Encode as minimal uncompressed PNG using zlib
  const { deflateSync } = require('node:zlib') as typeof import('node:zlib');

  // PNG raw image data: filter byte (0) + row pixels
  const rawData = Buffer.alloc(SIZE * (1 + SIZE * 4));
  for (let y = 0; y < SIZE; y++) {
    const rowOffset = y * (1 + SIZE * 4);
    rawData[rowOffset] = 0; // No filter
    pixels.copy(rawData, rowOffset + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }

  const compressed = deflateSync(rawData);

  const chunks: Buffer[] = [];

  // PNG signature
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  // Helper to write a PNG chunk
  const writeChunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcInput = Buffer.concat([typeBuffer, data]);
    const crc = Buffer.alloc(4);
    crc.writeInt32BE(crc32(crcInput));
    chunks.push(len, typeBuffer, data, crc);
  };

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  writeChunk('IHDR', ihdr);

  // IDAT
  writeChunk('IDAT', compressed);

  // IEND
  writeChunk('IEND', Buffer.alloc(0));

  const png = Buffer.concat(chunks);
  return nativeImage.createFromBuffer(png);
}

// CRC-32 for PNG chunk checksums
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) | 0;
}

function focusWindow(getWindow: () => BrowserWindow | null): void {
  const win = getWindow();
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function buildContextMenu(
  getWindow: () => BrowserWindow | null,
  serverUrl: string,
): Electron.Menu {
  const items: Electron.MenuItemConstructorOptions[] = [];

  if (currentState === 'detected' && detectedMeetingId) {
    const meetingId = detectedMeetingId;
    items.push(
      {
        label: 'Record Meeting',
        click: () => {
          void fetch(`${serverUrl}/meetings/${meetingId}/accept`, { method: 'POST' }).then((res) => {
            if (res.ok) {
              currentState = 'recording';
              detectedMeetingId = null;
              updateTray(getWindow, serverUrl);
            }
          });
        },
      },
      {
        label: 'Dismiss',
        click: () => {
          void fetch(`${serverUrl}/meetings/${meetingId}/dismiss`, { method: 'POST' }).then((res) => {
            if (res.ok) {
              currentState = 'idle';
              detectedMeetingId = null;
              updateTray(getWindow, serverUrl);
            }
          });
        },
      },
      { type: 'separator' },
    );
  }

  if (currentState === 'recording') {
    items.push(
      {
        label: 'Recording in progress...',
        enabled: false,
      },
      { type: 'separator' },
    );
  }

  items.push(
    {
      label: 'Open Stitch',
      click: () => focusWindow(getWindow),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  );

  return Menu.buildFromTemplate(items);
}

function updateTray(
  getWindow: () => BrowserWindow | null,
  serverUrl: string,
): void {
  if (!tray) return;

  if (currentState === 'recording') {
    tray.setImage(createRecordingIcon());
    tray.setToolTip('Stitch — Recording');
  } else if (currentState === 'detected') {
    tray.setImage(getAppIconPath());
    tray.setToolTip('Stitch — Meeting detected');
  } else {
    tray.setImage(getAppIconPath());
    tray.setToolTip('Stitch');
  }

  tray.setContextMenu(buildContextMenu(getWindow, serverUrl));
}

export function initTray(
  sseClient: SseClient,
  serverUrl: string,
  getWindow: () => BrowserWindow | null,
): void {
  tray = new Tray(getAppIconPath());
  tray.setToolTip('Stitch');
  tray.setContextMenu(buildContextMenu(getWindow, serverUrl));

  tray.on('click', () => {
    focusWindow(getWindow);
  });

  sseClient.on('meeting-detected', (data) => {
    currentState = 'detected';
    detectedMeetingId = data.meetingId;
    updateTray(getWindow, serverUrl);
  });

  sseClient.on('meeting-recording-finished', () => {
    currentState = 'idle';
    detectedMeetingId = null;
    updateTray(getWindow, serverUrl);
  });

  sseClient.on('meeting-ended', () => {
    currentState = 'idle';
    detectedMeetingId = null;
    updateTray(getWindow, serverUrl);
  });
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
