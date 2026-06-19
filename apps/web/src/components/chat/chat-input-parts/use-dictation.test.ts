import { describe, expect, test } from 'bun:test';

import { spliceTranscript } from './use-dictation.js';

describe('spliceTranscript', () => {
  test('returns the transcript alone when the base is empty', () => {
    expect(spliceTranscript('', 'hello world')).toBe('hello world');
  });

  test('joins base and transcript with a single space', () => {
    expect(spliceTranscript('note:', 'hello world')).toBe('note: hello world');
  });

  test('trims trailing whitespace from the base before joining', () => {
    expect(spliceTranscript('note:   ', 'hello')).toBe('note: hello');
  });

  test('omits the separator when there is no transcript yet', () => {
    expect(spliceTranscript('existing text', '')).toBe('existing text');
  });

  test('returns an empty string when both inputs are empty', () => {
    expect(spliceTranscript('', '')).toBe('');
  });
});
