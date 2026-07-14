import { describe, expect, test } from 'bun:test';

import { buildRetrievalQuery } from '@/memory/query.js';

describe('buildRetrievalQuery', () => {
  test('returns null for low-signal messages when skipLowSignal is on', () => {
    for (const userText of ['so prioritize that', 'continue', 'hello?', 'ok']) {
      const result = buildRetrievalQuery({
        userText,
        previousAssistantText: null,
        contextAwareQuery: false,
        skipLowSignal: true,
      });
      expect(result).toBeNull();
    }
  });

  test('returns the bare user text for messages with enough signal tokens', () => {
    const result = buildRetrievalQuery({
      userText: 'does obsidian support markdown export options',
      previousAssistantText: null,
      contextAwareQuery: false,
      skipLowSignal: true,
    });
    expect(result).toBe('does obsidian support markdown export options');
  });

  test('does not skip low-signal messages when skipLowSignal is off', () => {
    const result = buildRetrievalQuery({
      userText: 'continue',
      previousAssistantText: null,
      contextAwareQuery: false,
      skipLowSignal: false,
    });
    expect(result).toBe('continue');
  });

  test('concatenates previous assistant text and user text when contextAwareQuery is on', () => {
    const result = buildRetrievalQuery({
      userText: 'so prioritize that',
      previousAssistantText: 'Obsidian is a note-taking app.',
      contextAwareQuery: true,
      skipLowSignal: false,
    });
    expect(result).toBe('Obsidian is a note-taking app.\nso prioritize that');
  });

  test('truncates previous assistant text to the last 500 characters', () => {
    const longAssistantText = 'a'.repeat(600) + 'TAIL_MARKER';
    const result = buildRetrievalQuery({
      userText: 'continue building this',
      previousAssistantText: longAssistantText,
      contextAwareQuery: true,
      skipLowSignal: false,
    });
    const expectedTail = longAssistantText.slice(-500);
    expect(expectedTail.length).toBe(500);
    expect(result).toBe(`${expectedTail}\ncontinue building this`);
  });

  test('returns bare user text when contextAwareQuery is on but there is no previous assistant text', () => {
    const result = buildRetrievalQuery({
      userText: 'is obsidian a task harness',
      previousAssistantText: null,
      contextAwareQuery: true,
      skipLowSignal: false,
    });
    expect(result).toBe('is obsidian a task harness');
  });

  test('returns bare user text when contextAwareQuery is off, even with previous assistant text', () => {
    const result = buildRetrievalQuery({
      userText: 'does obsidian support markdown export',
      previousAssistantText: 'Obsidian is a note-taking app.',
      contextAwareQuery: false,
      skipLowSignal: false,
    });
    expect(result).toBe('does obsidian support markdown export');
  });
});
