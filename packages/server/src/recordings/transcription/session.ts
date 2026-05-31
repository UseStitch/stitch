import type { RecordingTranscriptEntry } from '@stitch/shared/recordings/types';

import * as Events from '@/lib/events.js';
import * as Log from '@/lib/log.js';
import { getTranscriptionProvider } from '@/recordings/transcription/registry.js';

const log = Log.create({ service: 'live-transcription' });

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
  let micChunkCount = 0;
  let speakerChunkCount = 0;

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

  // Send each chunk immediately (no buffering).
  // Base64 strings cannot be concatenated safely (padding chars would corrupt data).
  const unsubscribe = Events.on('recording-audio-chunk', (payload) => {
    if (stopped || payload.recordingId !== config.recordingId) return;

    if (payload.source === 'mic') {
      micChunkCount += 1;
      micConnection.sendAudio(payload.samplesB64);
    } else {
      speakerChunkCount += 1;
      speakerConnection.sendAudio(payload.samplesB64);
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

      unsubscribe();
      micConnection.close();
      speakerConnection.close();

      log.info(
        {
          recordingId: config.recordingId,
          entries: transcript.length,
          micChunks: micChunkCount,
          speakerChunks: speakerChunkCount,
        },
        'live transcription session stopped',
      );

      return transcript;
    },
  };
}
