import type { TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import type { STTTransport } from '@/stt/adapter-iface.js';

const log = Log.create({ service: 'stt.ws-transport' });

type WsTransportConfig = {
  url: string;
  headers: Record<string, string>;
  /** Called once the WebSocket is open. Return initial messages to send (e.g. session config). */
  onReady?: () => string[];
  /** Parse an incoming message. Return events to dispatch, or null to skip. */
  parseMessage: (data: string) => WsMessageResult | null;
  /** Log label for diagnostics. */
  label: string;
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
  keepAliveMessage?: string;
};

type PingableWebSocket = WebSocket & {
  ping?: () => void;
};

export type WsMessageResult = {
  transcript?: TranscriptEvent;
  usage?: STTUsage;
  error?: Error;
};

/**
 * Creates an STTTransport backed by a WebSocket connection.
 * Encapsulates the open/message/close/error lifecycle and the `as unknown as string[]` cast
 * required by the WebSocket constructor for custom headers.
 */
export function createWsTransport(
  config: WsTransportConfig,
  buildAudioMessage: (chunk: { samplesB64: string; sampleRateHz: number }) => string | Uint8Array,
  buildCommitMessage: () => string,
): Promise<STTTransport> {
  return new Promise((resolve, reject) => {
    const transcriptListeners: ((e: TranscriptEvent) => void)[] = [];
    const usageListeners: ((u: STTUsage) => void)[] = [];
    const errorListeners: ((err: Error) => void)[] = [];
    const closeListeners: (() => void)[] = [];

    // The WebSocket constructor in Node does not have a typed overload for headers.
    // This cast is isolated here so adapters don't repeat it.
    const ws = new WebSocket(config.url, {
      headers: config.headers,
    } as unknown as string[]);

    let opened = false;
    let closed = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pongTimer: ReturnType<typeof setTimeout> | null = null;

    function stopKeepAlive(): void {
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (pongTimer) {
        clearTimeout(pongTimer);
        pongTimer = null;
      }
    }

    function emitError(err: Error): void {
      for (const cb of errorListeners) cb(err);
    }

    function cleanupListeners(): void {
      ws.removeEventListener('open', handleOpen);
      ws.removeEventListener('message', handleMessage);
      ws.removeEventListener('close', handleClose);
      ws.removeEventListener('error', handleError);
      ws.removeEventListener('pong', handlePong as EventListener);
    }

    function closeSocket(code: number, reason: string): void {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(code, reason);
      }
    }

    function armPongTimeout(): void {
      if (!config.pongTimeoutMs) return;
      if (pongTimer) clearTimeout(pongTimer);

      pongTimer = setTimeout(() => {
        const err = new Error(`${config.label} WebSocket missing pong`);
        (err as Error & { code?: string }).code = 'missing-pong';
        emitError(err);
        closeSocket(4000, 'missing pong');
      }, config.pongTimeoutMs);
    }

    function markAlive(): void {
      if (pongTimer) {
        clearTimeout(pongTimer);
        pongTimer = null;
      }
    }

    function sendKeepAlive(): void {
      if (ws.readyState !== WebSocket.OPEN) return;

      const pingable = ws as PingableWebSocket;
      if (pingable.ping) {
        pingable.ping();
      } else if (config.keepAliveMessage) {
        ws.send(config.keepAliveMessage);
      } else {
        return;
      }

      armPongTimeout();
    }

    function startKeepAlive(): void {
      if (!config.pingIntervalMs) return;
      sendKeepAlive();
      pingTimer = setInterval(sendKeepAlive, config.pingIntervalMs);
    }

    function handleOpen(): void {
      opened = true;
      log.debug({ label: config.label }, 'WebSocket opened');

      if (config.onReady) {
        for (const msg of config.onReady()) {
          ws.send(msg);
        }
      }

      const transport: STTTransport = {
        sendAudio(chunk) {
          if (ws.readyState !== WebSocket.OPEN) {
            log.warn(
              { label: config.label, readyState: ws.readyState },
              'dropping audio, socket not open',
            );
            return;
          }
          ws.send(buildAudioMessage(chunk));
        },
        commit() {
          if (ws.readyState !== WebSocket.OPEN) {
            log.warn(
              { label: config.label, readyState: ws.readyState },
              'dropping commit, socket not open',
            );
            return;
          }
          ws.send(buildCommitMessage());
        },
        async close() {
          closed = true;
          stopKeepAlive();
          cleanupListeners();
          closeSocket(1000, 'client close');
        },
        onTranscript(cb) {
          transcriptListeners.push(cb);
        },
        onUsage(cb) {
          usageListeners.push(cb);
        },
        onError(cb) {
          errorListeners.push(cb);
        },
        onClose(cb) {
          closeListeners.push(cb);
        },
      };

      startKeepAlive();
      resolve(transport);
    }

    function handleMessage(event: MessageEvent): void {
      markAlive();
      try {
        const result = config.parseMessage(String(event.data));
        if (!result) return;

        if (result.transcript) {
          for (const cb of transcriptListeners) cb(result.transcript);
        }
        if (result.usage) {
          for (const cb of usageListeners) cb(result.usage);
        }
        if (result.error) {
          for (const cb of errorListeners) cb(result.error);
        }
      } catch (err) {
        log.warn({ error: err, label: config.label }, 'failed to parse WebSocket message');
      }
    }

    function handleClose(event: CloseEvent): void {
      stopKeepAlive();
      cleanupListeners();
      if (closed) return;

      const err = new Error(`${config.label} WebSocket closed: ${event.code} ${event.reason}`);
      (err as Error & { code?: string }).code = String(event.code);

      if (!opened) {
        reject(err);
        return;
      }

      if (event.code !== 1000) {
        emitError(err);
      }

      for (const cb of closeListeners) cb();
    }

    function handleError(event: Event): void {
      const message = (event as ErrorEvent).message ?? 'unknown';
      const err = new Error(`${config.label} WebSocket error: ${message}`);
      if (!opened) {
        reject(err);
        return;
      }
      emitError(err);
    }

    function handlePong(): void {
      markAlive();
    }

    ws.addEventListener('open', handleOpen);
    ws.addEventListener('message', handleMessage);
    ws.addEventListener('close', handleClose);
    ws.addEventListener('error', handleError);
    ws.addEventListener('pong', handlePong as EventListener);
  });
}
