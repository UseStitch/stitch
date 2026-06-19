import * as React from 'react';
import { toast } from 'sonner';

import type { SttInboundMessage, SttOutboundMessage } from '@stitch/shared/stt/types';

import { getServerUrl } from '@/lib/api';

type SttState = 'idle' | 'recording' | 'stopping';

type UseSttReturn = {
  state: SttState;
  committedText: string;
  partialText: string;
  audioLevel: number;
  startedAt: number | null;
  start: (providerId: string, modelId: string, sampleRateHz: number) => Promise<void>;
  stop: () => Promise<string>;
  cancel: () => void;
};

/** Root-mean-square amplitude of a PCM frame, normalized to a usable 0–1 meter range. */
export function computeAudioLevel(f32: Float32Array): number {
  if (f32.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < f32.length; i++) {
    sumSquares += f32[i] * f32[i];
  }
  const rms = Math.sqrt(sumSquares / f32.length);
  // Speech RMS rarely exceeds ~0.3; scale so normal speaking fills the meter.
  return Math.min(1, rms * 3);
}

function toWsUrl(serverUrl: string): string {
  const url = new URL('/stt/stream', serverUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

function encodeF32ToPcmS16le(f32: Float32Array): Int16Array {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const SESSION_ID_COUNTER = { value: 0 };

function nextSessionId(): string {
  return `stt-${Date.now()}-${++SESSION_ID_COUNTER.value}`;
}

export function useStt(): UseSttReturn {
  const [state, setState] = React.useState<SttState>('idle');
  const [committedText, setCommittedText] = React.useState('');
  const [partialText, setPartialText] = React.useState('');
  const [audioLevel, setAudioLevel] = React.useState(0);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);

  // Refs hold the live session state so callbacks don't capture stale closures.
  const wsRef = React.useRef<WebSocket | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const workletRef = React.useRef<AudioWorkletNode | null>(null);
  const sessionIdRef = React.useRef<string>('');
  const finalTextRef = React.useRef<string>('');
  const stopResolveRef = React.useRef<((text: string) => void) | null>(null);
  const stopRejectRef = React.useRef<((err: Error) => void) | null>(null);
  const levelRef = React.useRef(0);
  const levelRafRef = React.useRef<number | null>(null);

  // Cleanup all audio and WS resources.
  const cleanup = React.useCallback(() => {
    if (levelRafRef.current !== null) {
      cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    levelRef.current = 0;
    setAudioLevel(0);
    setStartedAt(null);
    workletRef.current?.disconnect();
    workletRef.current?.port.close();
    workletRef.current = null;
    audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const send = React.useCallback((msg: SttInboundMessage) => {
    wsRef.current?.send(JSON.stringify(msg));
  }, []);

  const start = React.useCallback(
    async (providerId: string, modelId: string, sampleRateHz: number) => {
      if (state !== 'idle') return;

      const serverUrl = await getServerUrl();
      const sessionId = nextSessionId();
      sessionIdRef.current = sessionId;
      finalTextRef.current = '';
      setCommittedText('');
      setPartialText('');

      // Open mic
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        toast.error('Microphone access denied');
        return;
      }
      streamRef.current = stream;

      // Set up AudioContext for PCM capture at the model's required sample rate
      const audioCtx = new AudioContext({ sampleRate: sampleRateHz });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      // Load AudioWorklet processor module
      // Use relative path for Electron file:// compatibility
      const workletUrl = new URL('pcm-capture-processor.js', window.location.href).href;
      await audioCtx.audioWorklet.addModule(workletUrl);
      const workletNode = new AudioWorkletNode(audioCtx, 'pcm-capture-processor', {
        processorOptions: { chunkSize: Math.round(sampleRateHz * 0.1) },
      });
      workletRef.current = workletNode;

      // Open WebSocket
      const ws = new WebSocket(toWsUrl(serverUrl));
      wsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject(new Error('WebSocket connection failed'));
      }).catch((err: Error) => {
        cleanup();
        toast.error(err.message);
        throw err;
      });

      ws.onmessage = (event) => {
        let msg: SttOutboundMessage;
        try {
          msg = JSON.parse(event.data as string) as SttOutboundMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'transcript': {
            if (msg.kind === 'partial') {
              setPartialText(msg.text);
            } else {
              finalTextRef.current += (finalTextRef.current ? ' ' : '') + msg.text;
              setCommittedText(finalTextRef.current);
              setPartialText('');
            }
            break;
          }
          case 'done': {
            const result = finalTextRef.current;
            stopResolveRef.current?.(result);
            stopResolveRef.current = null;
            stopRejectRef.current = null;
            setState('idle');
            setCommittedText('');
            setPartialText('');
            cleanup();
            break;
          }
          case 'error': {
            const err = new Error(msg.message);
            if (stopRejectRef.current) {
              stopRejectRef.current(err);
              stopResolveRef.current = null;
              stopRejectRef.current = null;
            } else {
              toast.error(`STT error: ${msg.message}`);
            }
            setState('idle');
            setCommittedText('');
            setPartialText('');
            cleanup();
            break;
          }
        }
      };

      ws.onclose = (_event) => {
        if (stopRejectRef.current) {
          stopRejectRef.current(new Error('WebSocket closed unexpectedly'));
          stopResolveRef.current = null;
          stopRejectRef.current = null;
        }
        setState('idle');
        setCommittedText('');
        setPartialText('');
        cleanup();
      };

      // Send start message
      send({
        type: 'start',
        sttSessionId: sessionId,
        providerId,
        modelId,
        service: 'chat-input',
        recordingId: sessionId,
        capabilityRequest: { partials: 'preferred', native_vad: 'preferred' },
        audioChunkConfig: { encoding: 'pcm_s16le', sampleRateHz },
      });

      // Wire up audio worklet message handler
      workletNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        const f32 = new Float32Array(e.data);
        levelRef.current = computeAudioLevel(f32);
        if (levelRafRef.current === null) {
          levelRafRef.current = requestAnimationFrame(() => {
            levelRafRef.current = null;
            setAudioLevel(levelRef.current);
          });
        }
        const pcm = encodeF32ToPcmS16le(f32);
        send({
          type: 'chunk',
          sttSessionId: sessionId,
          source: 'mic',
          samplesB64: int16ToBase64(pcm),
          sampleRateHz,
          numSamples: pcm.length,
        });
      };

      source.connect(workletNode);
      workletNode.connect(audioCtx.destination);

      setStartedAt(Date.now());
      setState('recording');
    },
    [state, send, cleanup],
  );

  const stop = React.useCallback((): Promise<string> => {
    if (state !== 'recording') return Promise.resolve('');

    setState('stopping');
    workletRef.current?.disconnect();

    return new Promise<string>((resolve, reject) => {
      stopResolveRef.current = resolve;
      stopRejectRef.current = reject;
      send({ type: 'stop', sttSessionId: sessionIdRef.current });
    });
  }, [state, send]);

  // Discard the in-progress recording without committing any transcript.
  const cancel = React.useCallback(() => {
    if (state === 'idle') return;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      send({ type: 'stop', sttSessionId: sessionIdRef.current });
    }
    stopResolveRef.current = null;
    stopRejectRef.current = null;
    finalTextRef.current = '';
    setState('idle');
    setCommittedText('');
    setPartialText('');
    cleanup();
  }, [state, send, cleanup]);

  // Clean up on unmount
  React.useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { state, committedText, partialText, audioLevel, startedAt, start, stop, cancel };
}
