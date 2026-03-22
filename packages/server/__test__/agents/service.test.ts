import { describe, expect, test } from 'vitest';

import { createAgent } from '@/agents/service.js';

describe('agents service validation', () => {
  test('requires systemPrompt when useBasePrompt is false', async () => {
    const result = await createAgent({
      name: 'Custom Agent',
      type: 'primary',
      useBasePrompt: false,
      systemPrompt: '   ',
    });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('systemPrompt is required when useBasePrompt is false');
      expect(result.status).toBe(400);
    }
  });
});
