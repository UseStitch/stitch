import { Notification } from 'electron';

import type { BrowserWindow } from 'electron';

import type { SseClient } from './sse-client';

type PendingMeeting = {
  meetingId: string;
  app: string;
};

let currentNotification: Notification | null = null;
let pendingMeeting: PendingMeeting | null = null;

function formatAppName(app: string): string {
  return app.replace(/\.exe$/i, '');
}

function formatDuration(secs: number): string {
  const mins = Math.floor(secs / 60);
  const remainder = Math.floor(secs % 60);
  if (mins === 0) return `${remainder}s`;
  return `${mins}m ${remainder}s`;
}

function isWindowVisible(win: BrowserWindow | null): boolean {
  if (!win || win.isDestroyed()) return false;
  return win.isVisible() && win.isFocused();
}

function focusWindow(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function dismissCurrent(): void {
  if (currentNotification) {
    currentNotification.close();
    currentNotification = null;
  }
  pendingMeeting = null;
}

function callServer(serverUrl: string, meetingId: string, action: 'accept' | 'dismiss'): void {
  void fetch(`${serverUrl}/meetings/${meetingId}/${action}`, { method: 'POST' }).catch(() => {
    // Server call failed — nothing we can do from a notification
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function showDetectedNotification(
  serverUrl: string,
  getWindow: () => BrowserWindow | null,
  meetingId: string,
  app: string,
): void {
  dismissCurrent();

  const appName = formatAppName(app);
  pendingMeeting = { meetingId, app };

  if (process.platform === 'win32') {
    // On Windows, use toastXml with foreground activation. Clicking the notification
    // or the "Record" button fires the 'click' event which we handle below.
    // The "Dismiss" button uses the toast's built-in dismiss action (type="dismiss")
    // which fires the 'close' event.
    currentNotification = new Notification({
      toastXml: `
        <toast activationType="foreground">
          <visual>
            <binding template="ToastGeneric">
              <text>Meeting Detected</text>
              <text>Meeting started on ${escapeXml(appName)}. Record?</text>
            </binding>
          </visual>
          <actions>
            <action content="Record" arguments="record" activationType="foreground" />
            <action content="Dismiss" arguments="dismiss" activationType="system" />
          </actions>
        </toast>`,
    });

    currentNotification.on('click', () => {
      if (pendingMeeting) {
        callServer(serverUrl, pendingMeeting.meetingId, 'accept');
        pendingMeeting = null;
      }
      focusWindow(getWindow());
    });

    currentNotification.on('close', () => {
      // User dismissed via the Dismiss button or swiped away.
      // Only dismiss the meeting if it's still pending (hasn't been accepted).
      if (pendingMeeting) {
        callServer(serverUrl, pendingMeeting.meetingId, 'dismiss');
        pendingMeeting = null;
      }
      currentNotification = null;
    });
  } else {
    // macOS: native action buttons work correctly
    currentNotification = new Notification({
      title: 'Meeting Detected',
      body: `Meeting started on ${appName}. Record?`,
      actions: [
        { type: 'button', text: 'Record' },
        { type: 'button', text: 'Dismiss' },
      ],
    });

    currentNotification.on('action', (_event, index) => {
      if (!pendingMeeting) return;
      if (index === 0) {
        callServer(serverUrl, pendingMeeting.meetingId, 'accept');
      } else {
        callServer(serverUrl, pendingMeeting.meetingId, 'dismiss');
      }
      pendingMeeting = null;
    });

    currentNotification.on('click', () => {
      focusWindow(getWindow());
    });
  }

  currentNotification.show();
}

function showRecordingFinishedNotification(
  getWindow: () => BrowserWindow | null,
  app: string,
  durationSecs: number,
): void {
  dismissCurrent();

  const appName = formatAppName(app);
  const duration = formatDuration(durationSecs);

  currentNotification = new Notification({
    title: 'Recording Finished',
    body: `${appName} recording saved (${duration})`,
  });

  currentNotification.on('click', () => {
    focusWindow(getWindow());
  });

  currentNotification.show();
}

export function initNotifications(
  sseClient: SseClient,
  serverUrl: string,
  getWindow: () => BrowserWindow | null,
): void {
  sseClient.on('meeting-detected', (data) => {
    if (isWindowVisible(getWindow())) return;
    showDetectedNotification(serverUrl, getWindow, data.meetingId, data.app);
  });

  sseClient.on('meeting-recording-started', () => {
    dismissCurrent();
  });

  sseClient.on('meeting-recording-finished', (data) => {
    if (isWindowVisible(getWindow())) return;
    showRecordingFinishedNotification(getWindow, data.app, data.durationSecs);
  });

  sseClient.on('meeting-ended', () => {
    dismissCurrent();
  });
}
