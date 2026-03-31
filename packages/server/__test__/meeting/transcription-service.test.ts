import { describe, expect, test } from 'vitest';

import { transcriptionInternals } from '@/meeting/transcription-service.js';

function createStereoWav(durationSeconds: number, sampleRate = 16_000): Uint8Array {
  const channels = 2;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = Math.floor(durationSeconds * byteRate);

  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return new Uint8Array(buffer);
}

describe('transcription-service helpers', () => {
  test('injects profile name into transcription prompt local speaker label', () => {
    const prompt = transcriptionInternals.buildTranscriptionPrompt('Jane');
    expect(prompt).toContain('LEFT channel speaker as `Jane`.');
  });

  test('falls back to Local User when profile name is missing', () => {
    const prompt = transcriptionInternals.buildTranscriptionPrompt(null);
    expect(prompt).toContain('LEFT channel speaker as `Local User`.');
  });

  test('splits long wav audio into chunked wav payloads', () => {
    const input = createStereoWav(3);
    const chunks = transcriptionInternals.splitWavIntoChunks(input, 1);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.totalChunks).toBe(3);
    expect(chunks[1]?.chunkIndex).toBe(2);
    expect(Buffer.from(chunks[0].audioData).toString('ascii', 0, 4)).toBe('RIFF');
    expect(Buffer.from(chunks[2].audioData).toString('ascii', 8, 12)).toBe('WAVE');
  });

  test('smooths one-turn speaker flips between the same speaker', () => {
    const smoothed = transcriptionInternals.smoothSpeakerAssignments([
      { speaker: 'Remote 1', content: 'We can ship this next week.' },
      { speaker: 'Remote 2', content: 'yeah' },
      { speaker: 'Remote 1', content: 'I will send the updated notes.' },
    ]);

    expect(smoothed).toEqual([
      { speaker: 'Remote 1', content: 'We can ship this next week.' },
      { speaker: 'Remote 1', content: 'yeah' },
      { speaker: 'Remote 1', content: 'I will send the updated notes.' },
    ]);
  });
});
