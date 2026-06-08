import * as React from 'react';
import { toast } from 'sonner';

import type { SttInboundMessage, SttOutboundMessage } from '@stitch/shared/stt/types';

import { getServerUrl } from '@/lib/api';

type SttState = 'idle' | 'recording' | 'stopping';

type UseSttReturn = {
  state: SttState;
  partialText: string;
  start: (providerId: string, modelId: string) => Promise<void>;
  stop: () => Promise<string>;
};

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
  const [partialText, setPartialText] = React.useState('');

  // Refs hold the live session state so callbacks don't capture stale closures.
  const wsRef = React.useRef<WebSocket | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const processorRef = React.useRef<ScriptProcessorNode | null>(null);
  const sessionIdRef = React.useRef<string>('');
  const finalTextRef = React.useRef<string>('');
  const stopResolveRef = React.useRef<((text: string) => void) | null>(null);
  const stopRejectRef = React.useRef<((err: Error) => void) | null>(null);

  // Cleanup all audio and WS resources.
  const cleanup = React.useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
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
    async (providerId: string, modelId: string) => {
      if (state !== 'idle') return;

      const serverUrl = await getServerUrl();
      const sessionId = nextSessionId();
      sessionIdRef.current = sessionId;
      finalTextRef.current = '';
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

      // Set up AudioContext for PCM capture at 16 kHz
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      // 4096-sample buffer → ~256 ms at 16 kHz
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

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
        setPartialText('');
        cleanup();
      };

      // Send start message
      const startMsg: SttInboundMessage = {
        type: 'start',
        sttSessionId: sessionId,
        providerId,
        modelId,
        capabilityRequest: { partials: 'preferred', native_vad: 'preferred' },
        audioChunkConfig: { encoding: 'pcm_s16le', sampleRateHz: 16000 },
      };
      send(startMsg);

      // Wire up audio processor
      processor.onaudioprocess = (e) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        const f32 = e.inputBuffer.getChannelData(0);
        const pcm = encodeF32ToPcmS16le(f32);
        send({
          type: 'chunk',
          sttSessionId: sessionId,
          source: 'mic',
          samplesB64: int16ToBase64(pcm),
          sampleRateHz: 16000,
          numSamples: pcm.length,
        });
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      setState('recording');
    },
    [state, send, cleanup],
  );

  const stop = React.useCallback((): Promise<string> => {
    if (state !== 'recording') return Promise.resolve('');

    setState('stopping');
    processorRef.current?.disconnect();

    return new Promise<string>((resolve, reject) => {
      stopResolveRef.current = resolve;
      stopRejectRef.current = reject;
      send({ type: 'stop', sttSessionId: sessionIdRef.current });
    });
  }, [state, send]);

  // Clean up on unmount
  React.useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return { state, partialText, start, stop };
}
