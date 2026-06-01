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

const SETUP_TIMEOUT_MS = 15_000;
const PREEMPTIVE_ROTATE_MS = 8.5 * 60_000;
const MAX_RECONNECT_DELAY_MS = 10_000;
const MAX_PENDING_AUDIO_CHUNKS = 100;
const MAX_WS_BUFFERED_AMOUNT = 5_000_000;
const FINAL_TRANSCRIPT_DRAIN_MS = 7_000;
const FINAL_TRANSCRIPT_QUIET_MS = 1_200;
const CLOSE_TIMEOUT_MS = 10_000;

type GeminiMessage = {
  goAway?: { timeLeft?: unknown };
  inputTranscription?: { text?: string };
  serverContent?: { inputTranscription?: { text?: string } };
  sessionResumptionUpdate?: { resumable?: boolean; newHandle?: string };
  setupComplete?: unknown;
  usageMetadata?: {
    promptTokenCount?: number;
    responseTokenCount?: number;
    totalTokenCount?: number;
    promptTokensDetails?: Array<{ modality: string; tokenCount: number }>;
    responseTokensDetails?: Array<{ modality: string; tokenCount: number }>;
  };
};

function buildWsUrl(config: LiveTranscriptionConnectionConfig): string {
  const base = config.endpoint;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}key=${config.apiKey}`;
}

function parseGeminiMessage(event: MessageEvent): GeminiMessage {
  return JSON.parse(typeof event.data === 'string' ? event.data : event.data.toString());
}

function buildSetupMessage(
  config: LiveTranscriptionConnectionConfig,
  sessionHandle: string | null,
): object {
  return {
    setup: {
      model: `models/${config.modelId}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
      },
      inputAudioTranscription: {},
      sessionResumption: sessionHandle ? { handle: sessionHandle } : {},
      contextWindowCompression: {
        slidingWindow: {},
      },
      systemInstruction: {
        parts: [
          {
            text: 'You are a silent transcription assistant. Listen to the audio. Do not respond or speak. Just listen.',
          },
        ],
      },
    },
  };
}

function connectGeminiSocket(
  config: LiveTranscriptionConnectionConfig,
  sessionHandle: string | null,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(buildWsUrl(config));
    let settled = false;

    const setupTimeout = setTimeout(() => {
      rejectSetup(new Error('Gemini Live API setup timed out'));
      ws.close();
    }, SETUP_TIMEOUT_MS);

    function cleanup(): void {
      clearTimeout(setupTimeout);
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('message', onMessage);
      ws.removeEventListener('error', onError);
      ws.removeEventListener('close', onClose);
    }

    function rejectSetup(error: Error): void {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function onOpen(): void {
      ws.send(JSON.stringify(buildSetupMessage(config, sessionHandle)));
    }

    function onMessage(event: MessageEvent): void {
      try {
        const message = parseGeminiMessage(event);
        if (!message.setupComplete) return;

        settled = true;
        cleanup();
        log.info(
          { model: config.modelId, resumed: Boolean(sessionHandle) },
          'gemini live session ready',
        );
        resolve(ws);
      } catch {
        rejectSetup(new Error('Failed to parse Gemini setup response'));
      }
    }

    function onError(event: Event): void {
      const errorEvent = event as ErrorEvent;
      rejectSetup(
        new Error(`Gemini WebSocket error during setup: ${errorEvent.message || 'unknown'}`),
      );
    }

    function onClose(event: CloseEvent): void {
      rejectSetup(
        new Error(
          `Gemini WebSocket closed before setup (code=${event.code}, reason=${event.reason || 'none'})`,
        ),
      );
    }

    ws.addEventListener('open', onOpen);
    ws.addEventListener('message', onMessage);
    ws.addEventListener('error', onError);
    ws.addEventListener('close', onClose);
  });
}

function createGeminiConnection(
  initialWs: WebSocket,
  config: LiveTranscriptionConnectionConfig,
): LiveTranscriptionConnection {
  let ws = initialWs;
  let transcriptCb: TranscriptCallback | null = null;
  let usageCb: UsageCallback | null = null;
  let errorCb: ErrorCallback | null = null;
  let stopped = false;
  let closing = false;
  let rotating = false;
  let lastMessageAt = Date.now();
  let latestSessionHandle: string | null = null;
  let reconnectFailures = 0;
  let rotateTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let rotationPromise: Promise<void> | null = null;
  const pendingAudio: string[] = [];

  function enqueueAudio(base64Pcm: string): void {
    pendingAudio.push(base64Pcm);
    if (pendingAudio.length <= MAX_PENDING_AUDIO_CHUNKS) return;

    pendingAudio.shift();
    log.warn({ pendingChunks: pendingAudio.length }, 'dropped queued gemini audio chunk');
  }

  function sendAudioToSocket(socket: WebSocket, base64Pcm: string): void {
    if (socket.bufferedAmount > MAX_WS_BUFFERED_AMOUNT) {
      log.warn({ bufferedAmount: socket.bufferedAmount }, 'gemini websocket send buffer is high');
    }

    socket.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data: base64Pcm,
            mimeType: `audio/pcm;rate=${config.sampleRateHz}`,
          },
        },
      }),
    );
  }

  function flushPendingAudio(): void {
    while (pendingAudio.length > 0 && ws.readyState === WebSocket.OPEN && !rotating) {
      const base64Pcm = pendingAudio.shift();
      if (!base64Pcm) return;
      sendAudioToSocket(ws, base64Pcm);
    }
  }

  function sendAudioStreamEnd(): void {
    if (ws.readyState !== WebSocket.OPEN) return;

    lastMessageAt = Date.now();

    ws.send(
      JSON.stringify({
        realtimeInput: {
          audioStreamEnd: true,
        },
      }),
    );
  }

  function waitForFinalMessages(): Promise<void> {
    const startedAt = Date.now();

    return new Promise((resolve) => {
      const interval = setInterval(() => {
        const now = Date.now();
        const isQuiet = now - lastMessageAt >= FINAL_TRANSCRIPT_QUIET_MS;
        const isTimedOut = now - startedAt >= FINAL_TRANSCRIPT_DRAIN_MS;

        if (isQuiet || isTimedOut || ws.readyState !== WebSocket.OPEN) {
          clearInterval(interval);
          resolve();
        }
      }, 100);
    });
  }

  function schedulePreemptiveRotation(): void {
    if (rotateTimer) {
      clearTimeout(rotateTimer);
    }

    rotateTimer = setTimeout(() => {
      rotateConnection('preemptive').catch((error) => {
        log.warn(
          { error: error instanceof Error ? error.message : 'unknown' },
          'failed to preemptively rotate gemini websocket',
        );
      });
    }, PREEMPTIVE_ROTATE_MS);
  }

  async function rotateConnection(reason: string): Promise<void> {
    if (stopped || closing) return;
    if (rotationPromise) return rotationPromise;

    rotating = true;
    rotationPromise = rotateConnectionInner(reason).finally(() => {
      rotationPromise = null;
    });

    return rotationPromise;
  }

  async function rotateConnectionInner(reason: string): Promise<void> {
    const previousWs = ws;

    while (!stopped && !closing) {
      try {
        log.info(
          { reason, hasSessionHandle: Boolean(latestSessionHandle) },
          'rotating gemini websocket',
        );
        const nextWs = await connectGeminiSocket(config, latestSessionHandle);

        if (stopped || closing) {
          nextWs.close(1000, 'session ended');
          return;
        }

        ws = nextWs;
        attachSocketListeners(nextWs);
        reconnectFailures = 0;
        rotating = false;
        schedulePreemptiveRotation();

        if (
          previousWs.readyState === WebSocket.OPEN ||
          previousWs.readyState === WebSocket.CONNECTING
        ) {
          previousWs.close(1000, 'rotated');
        }

        flushPendingAudio();
        return;
      } catch (error) {
        reconnectFailures += 1;
        const delayMs = Math.min(1_000 * 2 ** (reconnectFailures - 1), MAX_RECONNECT_DELAY_MS);
        log.warn(
          {
            reason,
            attempt: reconnectFailures,
            delayMs,
            error: error instanceof Error ? error.message : 'unknown',
          },
          'failed to reconnect gemini websocket',
        );

        if (reconnectFailures >= 5) {
          errorCb?.(error instanceof Error ? error : new Error('Gemini reconnect failed'));
        }

        await new Promise<void>((resolve) => {
          reconnectTimer = setTimeout(resolve, delayMs);
        });
      }
    }
  }

  function handleMessage(message: GeminiMessage): void {
    lastMessageAt = Date.now();

    if (message.sessionResumptionUpdate?.resumable && message.sessionResumptionUpdate.newHandle) {
      latestSessionHandle = message.sessionResumptionUpdate.newHandle;
    }

    if (message.goAway) {
      log.info({ timeLeft: message.goAway.timeLeft }, 'gemini websocket goAway received');
      rotateConnection('goAway').catch((error) => {
        log.warn(
          { error: error instanceof Error ? error.message : 'unknown' },
          'failed to rotate gemini websocket after goAway',
        );
      });
    }

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
  }

  function attachSocketListeners(socket: WebSocket): void {
    socket.addEventListener('message', (event: MessageEvent) => {
      if (socket !== ws || stopped) return;

      try {
        handleMessage(parseGeminiMessage(event));
      } catch (parseError) {
        log.warn(
          { error: parseError instanceof Error ? parseError.message : 'unknown' },
          'failed to parse gemini message',
        );
      }
    });

    socket.addEventListener('error', (event: Event) => {
      if (socket !== ws || stopped) return;

      const errorEvent = event as ErrorEvent;
      log.warn(
        { error: errorEvent.message || 'WebSocket error' },
        'gemini websocket error; reconnecting',
      );
      rotateConnection('error').catch((error) => {
        errorCb?.(error instanceof Error ? error : new Error('Gemini WebSocket error'));
      });
    });

    socket.addEventListener('close', (event: CloseEvent) => {
      if (socket !== ws || stopped) return;
      if (event.code === 1000 && rotating) return;

      log.warn({ code: event.code, reason: event.reason }, 'gemini websocket closed; reconnecting');
      rotateConnection('close').catch((error) => {
        errorCb?.(
          error instanceof Error
            ? error
            : new Error(
                `Gemini WebSocket closed unexpectedly (code=${event.code}, reason=${event.reason || 'none'})`,
              ),
        );
      });
    });
  }

  attachSocketListeners(ws);
  schedulePreemptiveRotation();

  return {
    sendAudio(base64Pcm: string): void {
      if (stopped) return;

      if (rotating || ws.readyState !== WebSocket.OPEN) {
        enqueueAudio(base64Pcm);
        return;
      }

      try {
        sendAudioToSocket(ws, base64Pcm);
      } catch (sendError) {
        enqueueAudio(base64Pcm);
        log.warn(
          { error: sendError instanceof Error ? sendError.message : 'unknown' },
          'failed to send gemini audio chunk; reconnecting',
        );
        rotateConnection('send-error').catch((error) => {
          errorCb?.(error instanceof Error ? error : new Error('Gemini send failed'));
        });
      }
    },

    close(): Promise<void> {
      closing = true;

      if (rotateTimer) {
        clearTimeout(rotateTimer);
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        stopped = true;
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          stopped = true;
          resolve();
        }, CLOSE_TIMEOUT_MS);

        async function finishClose(): Promise<void> {
          try {
            if (rotationPromise) {
              await Promise.race([
                rotationPromise,
                new Promise<void>((rotationResolve) => setTimeout(rotationResolve, 2_000)),
              ]);
            }

            flushPendingAudio();
            pendingAudio.length = 0;
            sendAudioStreamEnd();
            await waitForFinalMessages();
          } catch (error) {
            log.warn(
              { error: error instanceof Error ? error.message : 'unknown' },
              'failed while draining gemini websocket before close',
            );
          } finally {
            stopped = true;

            if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
              clearTimeout(timeout);
              resolve();
            } else {
              ws.addEventListener(
                'close',
                () => {
                  clearTimeout(timeout);
                  resolve();
                },
                { once: true },
              );

              ws.close(1000, 'session ended');
            }
          }
        }

        finishClose().catch((error) => {
          stopped = true;
          clearTimeout(timeout);
          log.warn(
            { error: error instanceof Error ? error.message : 'unknown' },
            'failed to close gemini websocket',
          );
          resolve();
        });
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
  async connect(config: LiveTranscriptionConnectionConfig): Promise<LiveTranscriptionConnection> {
    const ws = await connectGeminiSocket(config, null);
    return createGeminiConnection(ws, config);
  },
};
