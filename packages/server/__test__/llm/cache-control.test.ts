import { describe, test, expect } from 'vitest';

import {
  addCacheControlToMessages,
  getCacheConfig,
  getProviderOptions,
} from '@/llm/cache-control.js';
import type { ModelMessage } from 'ai';

describe('getCacheConfig', () => {
  test('returns anthropic config for anthropic provider', () => {
    const config = getCacheConfig('anthropic', 'claude-sonnet-4-5');
    expect(config).toEqual({
      namespace: 'anthropic',
      key: 'cacheControl',
      value: { type: 'ephemeral' },
    });
  });

  test('returns bedrock config for amazon-bedrock provider', () => {
    const config = getCacheConfig('amazon-bedrock', 'anthropic.claude-3-7-sonnet-20250219-v1:0');
    expect(config).toEqual({
      namespace: 'bedrock',
      key: 'cachePoint',
      value: { type: 'default' },
    });
  });

  test('returns openrouter config for openrouter provider', () => {
    const config = getCacheConfig('openrouter', 'anthropic/claude-sonnet-4-5');
    expect(config).toEqual({
      namespace: 'openrouter',
      key: 'cacheControl',
      value: { type: 'ephemeral' },
    });
  });

  test('returns anthropic config for google-vertex with claude model', () => {
    const config = getCacheConfig('google-vertex', 'claude-3-5-sonnet@20241022');
    expect(config).toEqual({
      namespace: 'anthropic',
      key: 'cacheControl',
      value: { type: 'ephemeral' },
    });
  });

  test('returns anthropic config for google-vertex with anthropic model', () => {
    const config = getCacheConfig('google-vertex', 'anthropic.claude-3-haiku');
    expect(config).toEqual({
      namespace: 'anthropic',
      key: 'cacheControl',
      value: { type: 'ephemeral' },
    });
  });

  test('returns null for google-vertex with gemini model', () => {
    expect(getCacheConfig('google-vertex', 'gemini-2.5-pro')).toBeNull();
  });

  test('returns null for openai provider', () => {
    expect(getCacheConfig('openai', 'gpt-4o')).toBeNull();
  });

  test('returns null for google provider', () => {
    expect(getCacheConfig('google', 'gemini-2.5-pro')).toBeNull();
  });

  test('returns null for vercel provider', () => {
    expect(getCacheConfig('vercel', 'v0-1.0-md')).toBeNull();
  });
});

describe('addCacheControlToMessages', () => {
  test('returns empty array for empty messages', () => {
    expect(addCacheControlToMessages([], 'anthropic', 'claude-sonnet-4-5')).toEqual([]);
  });

  test('returns messages unchanged for implicit caching providers', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
    ];
    const result = addCacheControlToMessages(messages, 'openai', 'gpt-4o');
    expect(result).toEqual(messages);
  });

  test('marks first system message and last 2 non-system messages', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'Response' },
      { role: 'user', content: 'Second message' },
    ];

    const result = addCacheControlToMessages(messages, 'anthropic', 'claude-sonnet-4-5');

    // System message (index 0) is marked
    expect(result[0].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    // Index 1 is not in the last 2 non-system messages
    expect(result[1].providerOptions).toBeUndefined();
    // Index 2 is second-to-last non-system message — marked
    expect(result[2].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    // Index 3 is last non-system message — marked
    expect(result[3].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });

  test('marks both system messages when two are present', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'Base system prompt' },
      { role: 'system', content: 'Agent system prompt' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Help me' },
    ];

    const result = addCacheControlToMessages(messages, 'anthropic', 'claude-sonnet-4-5');

    expect(result[0].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(result[1].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    // Index 2 is not in the last 2 non-system messages
    expect(result[2].providerOptions).toBeUndefined();
    // Last 2 non-system messages
    expect(result[3].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(result[4].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });

  test('adds bedrock cachePoint to system and last 2 messages', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];

    const result = addCacheControlToMessages(
      messages,
      'amazon-bedrock',
      'anthropic.claude-3-7-sonnet-20250219-v1:0',
    );

    expect(result[0].providerOptions).toEqual({
      bedrock: { cachePoint: { type: 'default' } },
    });
    expect(result[1].providerOptions).toEqual({
      bedrock: { cachePoint: { type: 'default' } },
    });
    expect(result[2].providerOptions).toEqual({
      bedrock: { cachePoint: { type: 'default' } },
    });
  });

  test('adds openrouter cacheControl to system and last 2 messages', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
      { role: 'user', content: 'How are you?' },
    ];

    const result = addCacheControlToMessages(messages, 'openrouter', 'anthropic/claude-sonnet-4-5');

    expect(result[0].providerOptions).toEqual({
      openrouter: { cacheControl: { type: 'ephemeral' } },
    });
    // Index 1 is not in the last 2 non-system
    expect(result[1].providerOptions).toBeUndefined();
    expect(result[2].providerOptions).toEqual({
      openrouter: { cacheControl: { type: 'ephemeral' } },
    });
    expect(result[3].providerOptions).toEqual({
      openrouter: { cacheControl: { type: 'ephemeral' } },
    });
  });

  test('handles single system message only', () => {
    const messages: ModelMessage[] = [{ role: 'system', content: 'System prompt' }];

    const result = addCacheControlToMessages(messages, 'anthropic', 'claude-sonnet-4-5');

    // System message gets marked (no non-system messages to mark)
    expect(result[0].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });

  test('deduplicates when system and tail overlap in short conversation', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
    ];

    const result = addCacheControlToMessages(messages, 'anthropic', 'claude-sonnet-4-5');

    // Both messages are marked, each only once
    expect(result[0].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(result[1].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });

  test('preserves existing providerOptions on messages', () => {
    const messages: ModelMessage[] = [
      {
        role: 'system',
        content: 'System prompt',
        providerOptions: {
          anthropic: { someOtherOption: true },
        },
      },
      { role: 'user', content: 'Hello' },
    ];

    const result = addCacheControlToMessages(messages, 'anthropic', 'claude-sonnet-4-5');

    expect(result[0].providerOptions).toEqual({
      anthropic: { someOtherOption: true, cacheControl: { type: 'ephemeral' } },
    });
  });

  test('does not mutate the original messages array', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
    ];

    const original0 = messages[0];
    const original1 = messages[1];

    addCacheControlToMessages(messages, 'anthropic', 'claude-sonnet-4-5');

    expect(messages[0]).toBe(original0);
    expect(messages[1]).toBe(original1);
    expect(messages[0].providerOptions).toBeUndefined();
    expect(messages[1].providerOptions).toBeUndefined();
  });

  test('marks only tail messages when no system messages exist', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Help me' },
    ];

    const result = addCacheControlToMessages(messages, 'anthropic', 'claude-sonnet-4-5');

    // No system messages; last 2 non-system messages are marked
    expect(result[0].providerOptions).toBeUndefined();
    expect(result[1].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(result[2].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });

  test('limits to at most 2 system messages even when more exist', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'System 1' },
      { role: 'system', content: 'System 2' },
      { role: 'system', content: 'System 3' },
      { role: 'user', content: 'Hello' },
    ];

    const result = addCacheControlToMessages(messages, 'anthropic', 'claude-sonnet-4-5');

    expect(result[0].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(result[1].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    // Third system message is NOT marked
    expect(result[2].providerOptions).toBeUndefined();
    // Last non-system message is marked
    expect(result[3].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });

  test('marks google-vertex anthropic model messages correctly', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Help me' },
    ];

    const result = addCacheControlToMessages(
      messages,
      'google-vertex',
      'claude-3-5-sonnet@20241022',
    );

    expect(result[0].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(result[1].providerOptions).toBeUndefined();
    expect(result[2].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(result[3].providerOptions).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });

  test('does not mark google-vertex gemini model messages', () => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
    ];

    const result = addCacheControlToMessages(messages, 'google-vertex', 'gemini-2.5-pro');

    expect(result[0].providerOptions).toBeUndefined();
    expect(result[1].providerOptions).toBeUndefined();
  });
});

describe('getProviderOptions', () => {
  const sessionId = 'ses_test-session-123';

  test('returns promptCacheKey for openai provider', () => {
    expect(getProviderOptions('openai', sessionId)).toEqual({
      openai: { promptCacheKey: sessionId },
    });
  });

  test('returns prompt_cache_key for openrouter provider', () => {
    expect(getProviderOptions('openrouter', sessionId)).toEqual({
      openrouter: { prompt_cache_key: sessionId },
    });
  });

  test('returns undefined for anthropic provider', () => {
    expect(getProviderOptions('anthropic', sessionId)).toBeUndefined();
  });

  test('returns undefined for amazon-bedrock provider', () => {
    expect(getProviderOptions('amazon-bedrock', sessionId)).toBeUndefined();
  });

  test('returns undefined for google provider', () => {
    expect(getProviderOptions('google', sessionId)).toBeUndefined();
  });

  test('returns undefined for google-vertex provider', () => {
    expect(getProviderOptions('google-vertex', sessionId)).toBeUndefined();
  });

  test('returns gateway caching auto for vercel provider', () => {
    expect(getProviderOptions('vercel', sessionId)).toEqual({
      gateway: { caching: 'auto' },
    });
  });
});
