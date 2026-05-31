import * as Log from '@/lib/log.js';
import type {
  ErrorCallback,
  LiveTranscriptionConnection,
  LiveTranscriptionConnectionConfig,
  LiveTranscriptionProvider,
  TranscriptCallback,
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
  let errorCb: ErrorCallback | null = null;

  ws.addEventListener('message', (event: MessageEvent) => {
    try {
      const message = JSON.parse(
        typeof event.data === 'string' ? event.data : event.data.toString(),
      );

      if (message.usageMetadata) {
        log.debug({ usage: message.usageMetadata }, 'gemini usage metadata');
      }

      const transcriptionText =
        message.serverContent?.inputTranscription?.text || message.inputTranscription?.text;

      if (transcriptionText && transcriptCb) {
        transcriptCb(transcriptionText);
      }
    } catch {
      log.warn('failed to parse gemini message');
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
      const err = new Error(
        `Gemini WebSocket closed unexpectedly (code=${event.code}, reason=${event.reason || 'none'})`,
      );
      log.warn({ code: event.code, reason: event.reason }, 'gemini websocket closed');
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

    close(): void {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close(1000, 'session ended');
      }
    },

    onTranscript(cb: TranscriptCallback): void {
      transcriptCb = cb;
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
        log.info({ model: config.modelId }, 'gemini websocket connected, sending setup');

        const setupMessage = {
          setup: {
            model: `models/${config.modelId}`,
            generationConfig: {
              responseModalities: ['TEXT'],
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
