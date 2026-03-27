import { EventEmitter } from 'node:events';

type MeetingEventMap = {
  'meeting-detected': [{ meetingId: string; app: string; startedAt: number }];
  'meeting-recording-started': [{ meetingId: string; app: string; startedAt: number }];
  'meeting-recording-finished': [{ meetingId: string; app: string; durationSecs: number }];
  'meeting-ended': [{ meetingId: string }];
};

const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Lightweight SSE client for the main process. Connects to the sidecar server's
 * /events endpoint and emits only meeting-related events. Auto-reconnects on
 * disconnect with exponential backoff.
 */
export class SseClient extends EventEmitter<MeetingEventMap> {
  private url: string;
  private controller: AbortController | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(serverUrl: string) {
    super();
    this.url = `${serverUrl}/events`;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.controller?.abort();
    this.controller = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private connect(): void {
    if (this.stopped) return;

    this.controller = new AbortController();

    void this.streamEvents(this.controller.signal).catch(() => {
      // Connection lost — schedule reconnect
      this.scheduleReconnect();
    });
  }

  private async streamEvents(signal: AbortSignal): Promise<void> {
    const res = await fetch(this.url, {
      signal,
      headers: { Accept: 'text/event-stream' },
    });

    if (!res.ok || !res.body) {
      throw new Error(`SSE connect failed: ${res.status}`);
    }

    // Successfully connected — reset backoff
    this.reconnectAttempt = 0;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEvent = '';
    let currentData = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentData = line.slice(5).trim();
        } else if (line === '') {
          // Empty line = end of event
          if (currentEvent && currentData) {
            this.handleEvent(currentEvent, currentData);
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }

    // Stream ended — try to reconnect
    throw new Error('SSE stream ended');
  }

  private handleEvent(event: string, data: string): void {
    const meetingEvents = new Set([
      'meeting-detected',
      'meeting-recording-started',
      'meeting-recording-finished',
      'meeting-ended',
    ]);

    if (!meetingEvents.has(event)) return;

    try {
      const parsed = JSON.parse(data) as MeetingEventMap[keyof MeetingEventMap][0];
      this.emit(event as keyof MeetingEventMap, parsed as never);
    } catch {
      // Malformed data — skip
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;

    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
