import { describe, expect, test } from 'vitest';

import { buildPromptEnvironment } from '@/llm/prompt/env.js';

describe('buildPromptEnvironment', () => {
  test('uses stable YYYY-MM-DD date format', () => {
    const env = buildPromptEnvironment();
    const line = env.split('\n').find((entry) => entry.startsWith('Current date: '));

    expect(line).toBeDefined();
    expect(line).toMatch(/^Current date: \d{4}-\d{2}-\d{2}$/);
    expect(line).not.toContain('T');

    if (process.platform === 'win32') {
      expect(env).toContain('Windows (user):');
      expect(env).not.toContain('macOS (user):');
      expect(env).not.toContain('Linux/XDG (user):');
    }
  });
});
