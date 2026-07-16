import { describe, expect, test } from 'bun:test';

import { getProviderOptions } from '@/llm/provider-options.js';

describe('getProviderOptions', () => {
  const sessionId = 'ses_test-session-123';

  test('returns promptCacheKey for openai provider', () => {
    expect(getProviderOptions('openai', sessionId)).toEqual({ openai: { promptCacheKey: sessionId } });
  });

  test('returns prompt_cache_key for openrouter provider', () => {
    expect(getProviderOptions('openrouter', sessionId)).toEqual({ openrouter: { prompt_cache_key: sessionId } });
  });

  test.each(['anthropic', 'amazon-bedrock', 'google', 'google-vertex', 'ollama_local', 'lmstudio_local'] as const)(
    'returns undefined for %s provider',
    (providerId) => {
      expect(getProviderOptions(providerId, sessionId)).toBeUndefined();
    },
  );
});
