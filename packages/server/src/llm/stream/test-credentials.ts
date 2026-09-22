import type { ProviderCredentials } from '@/llm/provider/provider.js';

export const TEST_LLM_CREDENTIALS: ProviderCredentials = {
  providerId: 'openai',
  auth: { method: 'api-key', apiKey: 'test-key' },
};
