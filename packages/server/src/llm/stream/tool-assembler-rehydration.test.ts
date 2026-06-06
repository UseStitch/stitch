import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { sessions, userSettings } from '@/db/schema.js';
import { setupTestDb } from '@/db/test-helpers.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { setSessionToolsetState } from '@/llm/stream/session-toolsets.js';
import { ToolAssembler } from '@/llm/stream/tool-assembler.js';
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

describe('ToolAssembler rehydration settings', () => {
  setupTestDb();

  beforeEach(() => {
    clearToolsets();
  });

  test('guard returns structured recovery when auto rehydrate is disabled', async () => {
    const sessionId = 'ses_rehydrate_disabled' as never;
    getDb().insert(sessions).values({ id: sessionId }).run();
    getDb()
      .update(userSettings)
      .set({ value: 'false' })
      .where(eq(userSettings.key, 'toolsets.autoRehydrate'))
      .run();
    registerToolset({
      id: 'browser',
      name: 'Browser',
      description: 'Browser toolset',
      tools: () => [{ name: 'browser_open', description: 'open' }],
      activate: async () => ({ browser_open: makeTool('open') }),
    } satisfies Toolset);
    setSessionToolsetState(sessionId, {
      turnCounter: 3,
      active: [],
      expired: [{ id: 'browser', expiredAtTurn: 3, toolNames: ['browser_open'] }],
    });

    const assembled = await ToolAssembler.create({
      sessionId,
      messageId: 'msg_rehydrate_disabled' as never,
      streamRunId: 'run_rehydrate_disabled',
      credentials: CREDENTIALS,
      modelId: 'openai/gpt-5.3-codex',
      abortSignal: new AbortController().signal,
    }).assemble();
    const result = (await assembled.staticTools.browser_open?.execute?.({}, {} as never)) as {
      status: string;
      autoRehydrate: boolean;
    };

    expect(result).toMatchObject({ status: 'not_active', autoRehydrate: false });
    expect(assembled.toolsetManager.getActiveTools()).not.toHaveProperty('browser_open');
  });
});
