import * as React from 'react';
import { toast } from 'sonner';

import type { SttProviderModels } from '@stitch/shared/stt/types';

import { useStt } from './use-stt';

import type { SttModelSelection } from '@/components/model-selectors/stt-model-selector-popover';

type UseDictationArgs = {
  value: string;
  onChange: (value: string) => void;
  sttProviders: SttProviderModels[];
  defaultProviderId: string | undefined;
  defaultModelId: string | undefined;
};

type DictationState = 'idle' | 'recording' | 'stopping';

type UseDictationReturn = {
  state: DictationState;
  audioLevel: number;
  startedAt: number | null;
  isRecording: boolean;
  isStopping: boolean;
  /** Toggle recording: starts when idle, finalizes the transcript when recording. */
  toggle: (model?: SttModelSelection) => void;
  /** Start recording (no-op if not idle). */
  start: (model?: SttModelSelection) => void;
  /** Finalize the transcript and splice it into the input. */
  stopAndCommit: () => Promise<void>;
  /** Discard the in-progress recording without committing. */
  cancel: () => void;
};

/** Joins the preserved prefix with new transcript text using a single space when needed. */
export function spliceTranscript(base: string, transcript: string): string {
  const trimmed = base.trimEnd();
  const separator = trimmed.length > 0 && transcript.length > 0 ? ' ' : '';
  return trimmed + separator + transcript;
}

export function useDictation({
  value,
  onChange,
  sttProviders,
  defaultProviderId,
  defaultModelId,
}: UseDictationArgs): UseDictationReturn {
  const stt = useStt();
  const baseOffsetRef = React.useRef(0);
  const valueRef = React.useRef(value);
  valueRef.current = value;
  // Set when stop is requested before recording has actually started (fast
  // push-to-talk taps). Finalizes as soon as the session reaches 'recording'.
  const pendingStopRef = React.useRef(false);

  const resolveModel = React.useCallback(
    (model?: SttModelSelection) => {
      const providerId = model?.providerId ?? defaultProviderId;
      const modelId = model?.modelId ?? defaultModelId;
      if (!providerId || !modelId) {
        toast.error('No STT model configured. Set one in Settings → General → STT Model.');
        return null;
      }
      const provider = sttProviders.find((p) => p.providerId === providerId);
      const found = provider?.models.find((m) => m.id === modelId);
      if (!found) {
        toast.error('Configured STT model not found. Check Settings → General → STT Model.');
        return null;
      }
      return { providerId, modelId, sampleRateHz: found.sampleRateHz };
    },
    [sttProviders, defaultProviderId, defaultModelId],
  );

  const start = React.useCallback(
    (model?: SttModelSelection) => {
      if (stt.state !== 'idle') return;
      const resolved = resolveModel(model);
      if (!resolved) return;
      pendingStopRef.current = false;
      baseOffsetRef.current = valueRef.current.length;
      void stt.start(resolved.providerId, resolved.modelId, resolved.sampleRateHz);
    },
    [stt, resolveModel],
  );

  const stopAndCommit = React.useCallback(async () => {
    // Release requested before the session finished starting up — finalize
    // once it reaches the recording state (see effect below).
    if (stt.state === 'idle' || stt.state === 'stopping') {
      pendingStopRef.current = true;
      return;
    }
    const transcript = await stt.stop();
    const base = valueRef.current.slice(0, baseOffsetRef.current);
    onChange(spliceTranscript(base, transcript));
  }, [stt, onChange]);

  // Honor a stop requested during the startup window.
  React.useEffect(() => {
    if (stt.state === 'recording' && pendingStopRef.current) {
      pendingStopRef.current = false;
      void stopAndCommit();
    }
  }, [stt.state, stopAndCommit]);

  const toggle = React.useCallback(
    (model?: SttModelSelection) => {
      if (stt.state === 'recording') {
        void stopAndCommit();
        return;
      }
      start(model);
    },
    [stt.state, start, stopAndCommit],
  );

  // Splice live partial + committed text into the input while recording.
  React.useEffect(() => {
    if (stt.state !== 'recording') return;
    const base = value.slice(0, baseOffsetRef.current);
    const transcript = [stt.committedText, stt.partialText].filter(Boolean).join(' ');
    const next = spliceTranscript(base, transcript);
    if (next !== value) onChange(next);
    // Only re-run when STT text changes — value intentionally omitted to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stt.committedText, stt.partialText, stt.state]);

  const cancel = React.useCallback(() => {
    pendingStopRef.current = false;
    stt.cancel();
  }, [stt]);

  return {
    state: stt.state,
    audioLevel: stt.audioLevel,
    startedAt: stt.startedAt,
    isRecording: stt.state === 'recording',
    isStopping: stt.state === 'stopping',
    toggle,
    start,
    stopAndCommit,
    cancel,
  };
}
