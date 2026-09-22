import type { LlmProviderCredentials } from '@/provider/config/schema.js';

export const TEST_LLM_CREDENTIALS: LlmProviderCredentials = {
  providerId: 'openai',
  auth: { method: 'api-key', apiKey: 'test-key' },
};
