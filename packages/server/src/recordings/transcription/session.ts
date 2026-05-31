import type { RecordingTranscriptEntry } from '@stitch/shared/recordings/types';

import * as Events from '@/lib/events.js';
import * as Log from '@/lib/log.js';
import { getTranscriptionProvider } from '@/recordings/transcription/registry.js';

const log = Log.create({ service: 'live-transcription' });

const FLUSH_INTERVAL_MS = 200;
const MAX_BUFFER_SAMPLES = 16_000; // 1 second at 16kHz — flush immediately if exceeded

type LiveTranscriptionSessionConfig = {
  recordingId: string;
  providerId: string;
  modelId: string;
  apiKey: string;
  endpoint: string;
  sampleRateHz: number;
};

export type LiveTranscriptionSession = {
  stop: () => RecordingTranscriptEntry[];
};

export async function startLiveTranscriptionSession(
  config: LiveTranscriptionSessionConfig,
): Promise<LiveTranscriptionSession> {
  const provider = getTranscriptionProvider(config.providerId);
  if (!provider) {
    throw new Error(`No live transcription provider for: ${config.providerId}`);
  }

  const connectionConfig = {
    apiKey: config.apiKey,
    endpoint: config.endpoint,
    modelId: config.modelId,
    sampleRateHz: config.sampleRateHz,
  };

  const [micConnection, speakerConnection] = await Promise.all([
    provider.connect(connectionConfig),
    provider.connect(connectionConfig),
  ]);

  const transcript: RecordingTranscriptEntry[] = [];
  let stopped = false;

  // Flow control buffers
  let micBuffer = '';
  let speakerBuffer = '';
  let micBufferSamples = 0;
  let speakerBufferSamples = 0;

  function flushMic(): void {
    if (micBuffer && micConnection) {
      micConnection.sendAudio(micBuffer);
      micBuffer = '';
      micBufferSamples = 0;
    }
  }

  function flushSpeaker(): void {
    if (speakerBuffer && speakerConnection) {
      speakerConnection.sendAudio(speakerBuffer);
      speakerBuffer = '';
      speakerBufferSamples = 0;
    }
  }

  const flushTimer = setInterval(() => {
    flushMic();
    flushSpeaker();
  }, FLUSH_INTERVAL_MS);

  function handleTranscript(source: 'mic' | 'speaker', text: string): void {
    if (stopped) return;

    const speaker = source === 'mic' ? 'You' : 'Them';
    const entry: RecordingTranscriptEntry = { speaker, content: text };
    transcript.push(entry);

    Events.emit('recording-transcript-entry', {
      recordingId: config.recordingId,
      source,
      content: text,
      isFinal: true,
    });
  }

  micConnection.onTranscript((text) => handleTranscript('mic', text));
  speakerConnection.onTranscript((text) => handleTranscript('speaker', text));

  function handleError(source: string, error: Error): void {
    log.error(
      { source, error: error.message, recordingId: config.recordingId },
      'transcription connection error',
    );
  }

  micConnection.onError((err) => handleError('mic', err));
  speakerConnection.onError((err) => handleError('speaker', err));

  // Subscribe to audio chunk events
  const unsubscribe = Events.on('recording-audio-chunk', (payload) => {
    if (stopped || payload.recordingId !== config.recordingId) return;

    if (payload.source === 'mic') {
      micBuffer += payload.samplesB64;
      micBufferSamples += payload.numSamples;
      if (micBufferSamples >= MAX_BUFFER_SAMPLES) {
        flushMic();
      }
    } else {
      speakerBuffer += payload.samplesB64;
      speakerBufferSamples += payload.numSamples;
      if (speakerBufferSamples >= MAX_BUFFER_SAMPLES) {
        flushSpeaker();
      }
    }
  });

  log.info(
    { recordingId: config.recordingId, providerId: config.providerId, modelId: config.modelId },
    'live transcription session started',
  );

  return {
    stop(): RecordingTranscriptEntry[] {
      if (stopped) return transcript;
      stopped = true;

      clearInterval(flushTimer);
      unsubscribe();

      // Final flush
      flushMic();
      flushSpeaker();

      // Close connections
      micConnection.close();
      speakerConnection.close();

      log.info(
        { recordingId: config.recordingId, entries: transcript.length },
        'live transcription session stopped',
      );

      return transcript;
    },
  };
}
