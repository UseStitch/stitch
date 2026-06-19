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

    ws.addEventListener('open', () => {
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
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close(1000, 'client close');
          }
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

      resolve(transport);
    });

    ws.addEventListener('message', (event) => {
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
    });

    ws.addEventListener('close', (event) => {
      const err = new Error(`${config.label} WebSocket closed: ${event.code} ${event.reason}`);
      (err as Error & { code?: string }).code = String(event.code);

      if (!opened) {
        reject(err);
        return;
      }

      if (event.code !== 1000) {
        for (const cb of errorListeners) cb(err);
      }

      for (const cb of closeListeners) cb();
    });

    ws.addEventListener('error', (event) => {
      const message = (event as ErrorEvent).message ?? 'unknown';
      const err = new Error(`${config.label} WebSocket error: ${message}`);
      if (!opened) {
        reject(err);
        return;
      }
      for (const cb of errorListeners) cb(err);
    });
  });
}
