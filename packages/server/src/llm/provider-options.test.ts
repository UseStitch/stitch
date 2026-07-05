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

  test('returns stream usage options for nvidia provider', () => {
    expect(getProviderOptions('nvidia', sessionId)).toEqual({ nvidia: { stream_options: { include_usage: true } } });
  });

  test('returns gateway caching auto for vercel provider', () => {
    expect(getProviderOptions('vercel', sessionId)).toEqual({ gateway: { caching: 'auto' } });
  });

  test.each([
    'anthropic',
    'amazon-bedrock',
    'google',
    'google-vertex',
    'elevenlabs',
    'assemblyai',
    'ollama_local',
  ] as const)('returns undefined for %s provider', (providerId) => {
    expect(getProviderOptions(providerId, sessionId)).toBeUndefined();
  });
});
