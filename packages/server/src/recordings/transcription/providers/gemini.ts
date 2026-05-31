import * as Log from '@/lib/log.js';
import type {
  ErrorCallback,
  LiveTranscriptionConnection,
  LiveTranscriptionConnectionConfig,
  LiveTranscriptionProvider,
  LiveTranscriptionUsage,
  TranscriptCallback,
  UsageCallback,
} from '@/recordings/transcription/provider-iface.js';

const log = Log.create({ service: 'transcription-gemini' });

function buildWsUrl(config: LiveTranscriptionConnectionConfig): string {
  const base = config.endpoint;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}key=${config.apiKey}`;
}

function createGeminiConnection(
  ws: WebSocket,
  config: LiveTranscriptionConnectionConfig,
): LiveTranscriptionConnection {
  let transcriptCb: TranscriptCallback | null = null;
  let usageCb: UsageCallback | null = null;
  let errorCb: ErrorCallback | null = null;

  ws.addEventListener('message', (event: MessageEvent) => {
    try {
      const message = JSON.parse(
        typeof event.data === 'string' ? event.data : event.data.toString(),
      );

      // Handle usage metadata updates (streamed incrementally by Gemini)
      if (message.usageMetadata && usageCb) {
        const usage: LiveTranscriptionUsage = {
          promptTokenCount: message.usageMetadata.promptTokenCount,
          responseTokenCount: message.usageMetadata.responseTokenCount,
          totalTokenCount: message.usageMetadata.totalTokenCount,
          promptTokensDetails: message.usageMetadata.promptTokensDetails,
          responseTokensDetails: message.usageMetadata.responseTokensDetails,
        };
        usageCb(usage);
      }

      const transcriptionText =
        message.serverContent?.inputTranscription?.text || message.inputTranscription?.text;

      if (transcriptionText && transcriptCb) {
        transcriptCb(transcriptionText);
      }
    } catch (parseError) {
      log.warn(
        { error: parseError instanceof Error ? parseError.message : 'unknown' },
        'failed to parse gemini message',
      );
    }
  });

  ws.addEventListener('error', (event: Event) => {
    const errorEvent = event as ErrorEvent;
    const err = new Error(errorEvent.message || 'WebSocket error');
    log.error({ error: err.message }, 'gemini websocket error');
    errorCb?.(err);
  });

  ws.addEventListener('close', (event: CloseEvent) => {
    if (event.code !== 1000) {
      log.warn({ code: event.code, reason: event.reason }, 'gemini websocket closed unexpectedly');
      const err = new Error(
        `Gemini WebSocket closed unexpectedly (code=${event.code}, reason=${event.reason || 'none'})`,
      );
      errorCb?.(err);
    }
  });

  return {
    sendAudio(base64Pcm: string): void {
      if (ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const message = {
        realtimeInput: {
          audio: {
            data: base64Pcm,
            mimeType: `audio/pcm;rate=${config.sampleRateHz}`,
          },
        },
      };
      ws.send(JSON.stringify(message));
    },

    close(): Promise<void> {
      if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve();
        }, 5_000);

        ws.addEventListener(
          'close',
          () => {
            clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );

        ws.close(1000, 'session ended');
      });
    },

    onTranscript(cb: TranscriptCallback): void {
      transcriptCb = cb;
    },

    onUsage(cb: UsageCallback): void {
      usageCb = cb;
    },

    onError(cb: ErrorCallback): void {
      errorCb = cb;
    },
  };
}

export const geminiProvider: LiveTranscriptionProvider = {
  connect(config: LiveTranscriptionConnectionConfig): Promise<LiveTranscriptionConnection> {
    return new Promise((resolve, reject) => {
      const url = buildWsUrl(config);
      const ws = new WebSocket(url);

      const setupTimeout = setTimeout(() => {
        ws.close();
        reject(new Error('Gemini Live API setup timed out'));
      }, 15_000);

      ws.addEventListener('open', () => {
        const setupMessage = {
          setup: {
            model: `models/${config.modelId}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
            },
            inputAudioTranscription: {},
            systemInstruction: {
              parts: [
                {
                  text: 'You are a silent transcription assistant. Listen to the audio. Do not respond or speak. Just listen.',
                },
              ],
            },
          },
        };
        ws.send(JSON.stringify(setupMessage));
      });

      let setupComplete = false;

      const onSetupMessage = (event: MessageEvent): void => {
        try {
          const message = JSON.parse(
            typeof event.data === 'string' ? event.data : event.data.toString(),
          );

          if (message.setupComplete && !setupComplete) {
            setupComplete = true;
            clearTimeout(setupTimeout);
            ws.removeEventListener('message', onSetupMessage);
            log.info({ model: config.modelId }, 'gemini live session ready');
            resolve(createGeminiConnection(ws, config));
          }
        } catch {
          clearTimeout(setupTimeout);
          reject(new Error('Failed to parse Gemini setup response'));
        }
      };

      ws.addEventListener('message', onSetupMessage);

      ws.addEventListener('error', (event: Event) => {
        if (!setupComplete) {
          clearTimeout(setupTimeout);
          const errorEvent = event as ErrorEvent;
          reject(
            new Error(`Gemini WebSocket error during setup: ${errorEvent.message || 'unknown'}`),
          );
        }
      });

      ws.addEventListener('close', (event: CloseEvent) => {
        if (!setupComplete) {
          clearTimeout(setupTimeout);
          reject(
            new Error(
              `Gemini WebSocket closed before setup (code=${event.code}, reason=${event.reason || 'none'})`,
            ),
          );
        }
      });
    });
  },
};
