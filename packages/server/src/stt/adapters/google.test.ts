import { describe, expect, test } from 'bun:test';

import { createGoogleMessageParser } from '@/stt/adapters/google.js';

describe('createGoogleMessageParser', () => {
  test('uses one segment id for interim and final transcriptions', () => {
    const parseMessage = createGoogleMessageParser(Date.now() - 1000);

    const partial = parseMessage(
      JSON.stringify({ serverContent: { interimInputTranscription: { text: 'Hello wor' } } }),
    );
    const final = parseMessage(JSON.stringify({ serverContent: { inputTranscription: { text: 'Hello world.' } } }));

    expect(partial?.transcript).toMatchObject({
      id: 'google-segment-0',
      kind: 'partial',
      text: 'Hello wor',
    });
    expect(final?.transcript).toMatchObject({
      id: 'google-segment-0',
      kind: 'final',
      text: 'Hello world.',
    });
  });

  test('parses modality token usage', () => {
    const parseMessage = createGoogleMessageParser(Date.now() - 1000);
    const result = parseMessage(
      JSON.stringify({
        usageMetadata: {
          promptTokenCount: 20,
          responseTokenCount: 8,
          promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 17 }],
          responseTokensDetails: [{ modality: 'TEXT', tokenCount: 6 }],
        },
      }),
    );

    expect(result?.usage).toMatchObject({ audioInputTokens: 17, textOutputTokens: 6 });
  });
});
