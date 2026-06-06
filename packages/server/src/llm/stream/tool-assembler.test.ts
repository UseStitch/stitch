import { beforeEach, describe, expect, test } from 'bun:test';

import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { getSessionToolsetState, setSessionToolsetState } from '@/llm/stream/session-toolsets.js';
import { buildExpiredToolsetsPrompt, ToolAssembler } from '@/llm/stream/tool-assembler.js';
import { listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';
import type { Tool } from 'ai';

const CREDENTIALS: ProviderCredentials = {
  providerId: 'openai',
  auth: { method: 'api-key', apiKey: 'test-key' },
};

function clearToolsets(): void {
  for (const id of listToolsetIds()) {
    unregisterToolset(id);
  }
}

function makeTool(description: string): Tool {
  return { description, parameters: { type: 'object', properties: {} } } as unknown as Tool;
}

describe('buildExpiredToolsetsPrompt', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('builds a model-visible notice for expired run-only toolsets', () => {
    registerToolset({
      id: 'browser',
      name: 'Browser',
      description: 'Browser toolset',
      tools: () => [{ name: 'browser_open', description: 'open' }],
      activate: async () => ({ browser_open: makeTool('open') }),
    } satisfies Toolset);

    const prompt = buildExpiredToolsetsPrompt([
      { id: 'browser', expiredAtTurn: 1, toolNames: ['browser_open'] },
    ]);

    expect(prompt).toContain('## Toolset Expiry Notice');
    expect(prompt).toContain('Browser (browser) expired');
    expect(prompt).toContain('Do not call their tools unless you first call `activate_toolset` again');
    expect(prompt).toContain('browser_open');
  });
});

describe('ToolAssembler expired toolset handling', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('adds expiry notice next turn and does not load expired tools', async () => {
    const sessionId = 'ses_expired_toolsets' as never;
    registerToolset({
      id: 'browser',
      name: 'Browser',
      description: 'Browser toolset',
      tools: () => [{ name: 'browser_open', description: 'open' }],
      activate: async () => ({ browser_open: makeTool('open') }),
    } satisfies Toolset);
    setSessionToolsetState(sessionId, {
      turnCounter: 1,
      active: [],
      expired: [{ id: 'browser', expiredAtTurn: 1, toolNames: ['browser_open'] }],
    });

    const assembled = await ToolAssembler.create({
      sessionId,
      messageId: 'msg_expired_toolsets' as never,
      streamRunId: 'run_expired_toolsets',
      credentials: CREDENTIALS,
      modelId: 'openai/gpt-5.3-codex',
      abortSignal: new AbortController().signal,
    }).assemble();

    expect(assembled.promptAdditions.join('\n')).toContain('Toolset Expiry Notice');
    expect(assembled.toolsetManager.getActiveTools()).not.toHaveProperty('browser_open');
    expect(getSessionToolsetState(sessionId).expired).toEqual([]);
  });
});
