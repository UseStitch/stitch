import { describe, expect, test } from 'bun:test';

import { createAssemblyAIMessageParser } from '@/stt/adapters/assemblyai.js';

describe('createAssemblyAIMessageParser', () => {
  test('uses the same turn id for partials and formatted finals', () => {
    const parseMessage = createAssemblyAIMessageParser(Date.now() - 1000);

    const partial = parseMessage(
      JSON.stringify({
        type: 'Turn',
        turn_order: 3,
        end_of_turn: false,
        transcript: 'hello',
        end_of_turn_confidence: 0,
        words: [{ text: 'hello', start: 10, end: 120, confidence: 0.98 }],
        utterance: null,
      }),
    );
    const final = parseMessage(
      JSON.stringify({
        type: 'Turn',
        turn_order: 3,
        end_of_turn: true,
        turn_is_formatted: true,
        transcript: 'Hello.',
        end_of_turn_confidence: 0.9,
        words: [{ text: 'Hello.', start: 10, end: 120, confidence: 0.98 }],
        utterance: null,
      }),
    );

    expect(partial?.transcript).toMatchObject({
      id: 'assemblyai-turn-3',
      kind: 'partial',
      text: 'hello',
      offsetMs: 10,
    });
    expect(final?.transcript).toMatchObject({
      id: 'assemblyai-turn-3',
      kind: 'final',
      text: 'Hello.',
      offsetMs: 10,
    });
  });

  test('does not emit duplicate finals for unformatted end-of-turn messages', () => {
    const parseMessage = createAssemblyAIMessageParser(Date.now() - 1000);

    const result = parseMessage(
      JSON.stringify({
        type: 'Turn',
        turn_order: 4,
        end_of_turn: true,
        turn_is_formatted: false,
        transcript: 'raw final',
        end_of_turn_confidence: 0.9,
        words: [{ text: 'raw', start: 20, end: 100, confidence: 0.98 }],
        utterance: null,
      }),
    );

    expect(result?.transcript).toMatchObject({
      id: 'assemblyai-turn-4',
      kind: 'partial',
      text: 'raw final',
      offsetMs: 20,
    });
  });

  test('keeps final behavior when formatted flag is absent', () => {
    const parseMessage = createAssemblyAIMessageParser(Date.now() - 1000);

    const result = parseMessage(
      JSON.stringify({
        type: 'Turn',
        turn_order: 4,
        end_of_turn: true,
        transcript: 'legacy final',
        end_of_turn_confidence: 0.9,
        words: [{ text: 'legacy', start: 20, end: 100, confidence: 0.98 }],
        utterance: null,
      }),
    );

    expect(result?.transcript).toMatchObject({
      id: 'assemblyai-turn-4',
      kind: 'final',
      text: 'legacy final',
      offsetMs: 20,
    });
  });

  test('emits an empty final for formatted forced endpoints', () => {
    const parseMessage = createAssemblyAIMessageParser(Date.now() - 1000);

    const result = parseMessage(
      JSON.stringify({
        type: 'Turn',
        turn_order: 5,
        end_of_turn: true,
        turn_is_formatted: true,
        transcript: '',
        end_of_turn_confidence: 0,
        words: [],
        utterance: null,
      }),
    );

    expect(result?.transcript).toMatchObject({
      id: 'assemblyai-turn-5',
      kind: 'final',
      text: '',
    });
  });
});
