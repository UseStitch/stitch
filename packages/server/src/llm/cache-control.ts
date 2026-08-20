import type { LlmProviderId } from '@stitch/shared/providers/types';

import type { ModelMessage, JSONValue, Tool } from 'ai';

type ProviderCacheConfig = { namespace: string; key: string; value: JSONValue };

const ANTHROPIC_CACHE: ProviderCacheConfig = {
  namespace: 'anthropic',
  key: 'cacheControl',
  value: { type: 'ephemeral' },
};

const BEDROCK_CACHE: ProviderCacheConfig = { namespace: 'bedrock', key: 'cachePoint', value: { type: 'default' } };

const OPENROUTER_CACHE: ProviderCacheConfig = {
  namespace: 'openrouter',
  key: 'cacheControl',
  value: { type: 'ephemeral' },
};

export function getCacheConfig(providerId: LlmProviderId, modelId: string): ProviderCacheConfig | null {
  switch (providerId) {
    case 'anthropic':
      return ANTHROPIC_CACHE;

    case 'amazon-bedrock':
      return BEDROCK_CACHE;

    case 'openrouter':
      return OPENROUTER_CACHE;

    case 'google-vertex':
      if (modelId.includes('claude') || modelId.includes('anthropic')) {
        return ANTHROPIC_CACHE;
      }
      return null;

    // OpenAI: automatic prefix caching, session-level key handled by provider options
    case 'openai':
    // Google, Google Vertex (Gemini): implicit caching enabled by default, no API control
    case 'google':
    // Vercel (AI Gateway): caching handled by gateway via provider options
    case 'vercel':
    // Ollama: local inference, no cache control support
    case 'ollama_local':
    // LM Studio: local inference, no cache control support
    case 'lmstudio_local':
    // NVIDIA: caching handled by API provider
    case 'nvidia':
      return null;
  }
}

function withCacheMarker(message: ModelMessage, config: ProviderCacheConfig): ModelMessage {
  return {
    ...message,
    providerOptions: {
      ...message.providerOptions,
      [config.namespace]: {
        ...(message.providerOptions?.[config.namespace] as Record<string, JSONValue> | undefined),
        [config.key]: config.value,
      },
    },
  };
}

/**
 * Adds provider-specific prompt caching markers to messages.
 *
 * Marks the system message and the latest user message with cache control
 * directives, reserving one breakpoint for tools (applied separately via
 * `addCacheControlToTools`).
 *
 * For providers with implicit caching (OpenAI, Google, Vercel),
 * messages are returned unchanged.
 */
export function addCacheControlToMessages(
  messages: ModelMessage[],
  providerId: LlmProviderId,
  modelId: string,
): ModelMessage[] {
  if (messages.length === 0) return messages;

  const config = getCacheConfig(providerId, modelId);
  if (!config) return messages;

  const systemIndex = messages.findIndex((m) => m.role === 'system');
  const userIndex = messages.findLastIndex((m) => m.role === 'user');

  if (systemIndex === -1 && userIndex === -1) return messages;

  const result = [...messages];
  if (systemIndex !== -1) {
    result[systemIndex] = withCacheMarker(result[systemIndex], config);
  }
  if (userIndex !== -1) {
    result[userIndex] = withCacheMarker(result[userIndex], config);
  }

  return result;
}

/**
 * Marks the last tool definition with a cache control breakpoint.
 * For providers with implicit caching, tools are returned unchanged.
 */
export function addCacheControlToTools(
  tools: Record<string, Tool>,
  providerId: LlmProviderId,
  modelId: string,
): Record<string, Tool> {
  const config = getCacheConfig(providerId, modelId);
  if (!config) return tools;

  const entries = Object.entries(tools);
  if (entries.length === 0) return tools;

  const [lastKey, lastTool] = entries[entries.length - 1];

  const markedTool = {
    ...lastTool,
    providerOptions: {
      ...(lastTool as { providerOptions?: Record<string, Record<string, JSONValue>> }).providerOptions,
      [config.namespace]: { [config.key]: config.value },
    },
  } as Tool;

  return { ...tools, [lastKey]: markedTool };
}
