import type { AudioChunk, TranscriptEvent, STTUsage } from '@stitch/shared/stt/types';

import * as Log from '@/lib/log.js';
import type { STTAdapter, STTConnection } from '@/stt/adapter-iface.js';
import { createManagedConnection, type RawConnection } from '@/stt/base-adapter.js';
import { getModelDescriptor } from '@/stt/registry.js';
import type { ModelDescriptor, STTConnectionConfig } from '@/stt/types.js';

const log = Log.create({ service: 'stt.google-chirp' });

/**
 * Google Cloud STT v2 streaming via the REST-based streaming endpoint.
 * Uses the `streamingRecognize` method with API key auth for v1.
 *
 * Note: Full gRPC bidi streaming would require @google-cloud/speech as a dependency.
 * For v1 we use the WebSocket-based proxy pattern with the REST streaming API.
 * When @google-cloud/speech is added, this adapter can be updated to use native gRPC.
 */

const GOOGLE_STT_V2_URL = 'https://speech.googleapis.com/v2';

type GoogleStreamingResult = {
  alternatives?: Array<{
    transcript?: string;
    words?: Array<{ word?: string; startOffset?: string; endOffset?: string }>;
  }>;
  isFinal?: boolean;
  languageCode?: string;
};

type GoogleStreamingResponse = {
  results?: GoogleStreamingResult[];
  error?: { code: number; message: string; status: string };
};

function createGoogleChirpRawConnection(config: STTConnectionConfig): Promise<RawConnection> {
  return new Promise((resolve, reject) => {
    const transcriptListeners: ((e: TranscriptEvent) => void)[] = [];
    const usageListeners: ((u: STTUsage) => void)[] = [];
    const errorListeners: ((err: Error) => void)[] = [];
    const closeListeners: (() => void)[] = [];

    const apiKey = config.auth.kind === 'apiKey' ? config.auth.key : '';
    let sessionStartMs = Date.now();
    let abortController: AbortController | null = new AbortController();
    let audioQueue: AudioChunk[] = [];
    let closed = false;

    // Google STT v2 streaming uses a POST with streaming body.
    // For simplicity in v1, we batch audio and send periodic streaming requests.
    // A more complete implementation would use @google-cloud/speech gRPC.

    async function startStream(): Promise<void> {
      sessionStartMs = Date.now();

      // Process audio queue in background
      void processLoop();
    }

    async function processLoop(): Promise<void> {
      while (!closed) {
        if (audioQueue.length === 0) {
          await new Promise((r) => setTimeout(r, 50));
          continue;
        }

        const chunks = audioQueue.splice(0, audioQueue.length);
        const audioContent = chunks.map((c) => c.samplesB64).join('');

        try {
          const recognizerPath = `projects/-/locations/global/recognizers/_`;
          const url = `${GOOGLE_STT_V2_URL}/${recognizerPath}:recognize?key=${apiKey}`;

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config: {
                autoDecodingConfig: {},
                languageCodes: config.language ? [config.language] : ['en-US'],
                model: 'chirp_2',
                features: {
                  enableWordTimeOffsets:
                    config.capabilities.satisfied.word_timestamps !== 'unsupported',
                  enableAutomaticPunctuation: true,
                },
              },
              content: audioContent,
            }),
            signal: abortController?.signal,
          });

          if (!response.ok) {
            const text = await response.text();
            const err = new Error(`Google STT: ${response.status} ${text}`);
            (err as Error & { statusCode?: number }).statusCode = response.status;
            for (const cb of errorListeners) cb(err);
            continue;
          }

          const data = (await response.json()) as GoogleStreamingResponse;

          if (data.error) {
            const err = new Error(`Google STT: ${data.error.message}`);
            for (const cb of errorListeners) cb(err);
            continue;
          }

          if (data.results) {
            for (const result of data.results) {
              const alt = result.alternatives?.[0];
              if (!alt?.transcript) continue;

              const evt: TranscriptEvent = {
                kind: result.isFinal ? 'final' : 'partial',
                text: alt.transcript,
                language: result.languageCode,
              };

              if (alt.words && alt.words.length > 0) {
                evt.words = alt.words.map((w) => ({
                  text: w.word ?? '',
                  startMs: parseGoogleDuration(w.startOffset),
                  endMs: parseGoogleDuration(w.endOffset),
                }));
              }

              for (const cb of transcriptListeners) cb(evt);

              if (result.isFinal) {
                const durationMs = Date.now() - sessionStartMs;
                for (const cb of usageListeners) cb({ durationMs });
              }
            }
          }
        } catch (err) {
          if (closed) break;
          if (err instanceof Error && err.name === 'AbortError') break;
          log.warn({ error: err }, 'Google STT request failed');
          for (const cb of errorListeners) cb(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    // Resolve immediately with the connection interface
    startStream()
      .then(() => {
        const conn: RawConnection = {
          send(chunk: AudioChunk) {
            if (closed) return;
            audioQueue.push(chunk);
          },
          commit() {
            // For Google, commit triggers processing of queued audio
          },
          async close() {
            closed = true;
            abortController?.abort();
            abortController = null;
            for (const cb of closeListeners) cb();
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

        resolve(conn);
      })
      .catch(reject);
  });
}

function parseGoogleDuration(duration?: string): number {
  if (!duration) return 0;
  // Google durations are like "1.500s"
  const seconds = parseFloat(duration.replace('s', ''));
  return Math.round(seconds * 1000);
}

function isFatalGoogle(err: Error): boolean {
  const statusCode = (err as Error & { statusCode?: number }).statusCode;
  if (statusCode === 401 || statusCode === 403) return true;
  if (statusCode === 404) return true; // invalid recognizer/model

  const msg = err.message.toLowerCase();
  if (msg.includes('permission') || msg.includes('quota') || msg.includes('billing')) return true;

  return false;
}

export const googleChirpAdapter: STTAdapter = {
  providerId: 'google',

  get models(): ModelDescriptor[] {
    return [getModelDescriptor('google', 'chirp_3')].filter(
      (m): m is ModelDescriptor => m !== null,
    );
  },

  async connect(config: STTConnectionConfig): Promise<STTConnection> {
    return createManagedConnection({
      buffer: config.buffer,
      reconnect: config.reconnect,
      isFatal: isFatalGoogle,
      openConnection: () => createGoogleChirpRawConnection(config),
    });
  },
};
