import { describe, expect, test } from 'bun:test';

import { QueryClient } from '@tanstack/react-query';

import { findCommand } from '../registry.js';

describe('skillifyCommand', () => {
  test('is registered as a prompt command', () => {
    const command = findCommand('skillify');

    expect(command).toMatchObject({
      kind: 'prompt',
      name: 'skillify',
      description: 'Turn this conversation into a reusable skill',
    });
  });

  test('builds prompt with optional user description', () => {
    const command = findCommand('skillify');
    if (!command || command.kind !== 'prompt') throw new Error('skillify command not found');

    const prompt = command.buildPrompt('my release workflow', {
      sessionId: null,
      selectedModel: null,
      isStreaming: false,
      setInput: () => {},
      actions: {
        requestCompaction: async () => {},
        generateAutomation: async () => {},
        submitPrompt: async () => {},
      },
      queryClient: new QueryClient(),
    });

    expect(prompt).toContain('Use the skillify skill');
    expect(prompt).toContain('User description: my release workflow');
  });

  test('supports create-skill alias', () => {
    expect(findCommand('create-skill')?.name).toBe('skillify');
  });
});
