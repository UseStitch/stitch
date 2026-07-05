import { beforeEach, describe, expect, test } from 'bun:test';

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { buildExpiredToolsetsPrompt, SessionContext } from '@/llm/stream/session-context.js';
import { getSessionToolsetState, setSessionToolsetState } from '@/llm/stream/session-toolsets.js';
import { listToolsetIds, registerToolset, unregisterToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';
import type { ModelMessage, Tool } from 'ai';

const CREDENTIALS: ProviderCredentials = {
  providerId: 'openai',
  auth: { method: 'api-key', apiKey: 'test-key' },
};

/** Minimal system message layout matching buildHistoryMessages output. */
const STUB_MESSAGES: ModelMessage[] = [
  { role: 'system', content: 'static layer' },
  { role: 'system', content: 'semiStatic layer' },
  { role: 'system', content: 'dynamic layer' },
  { role: 'user', content: 'Hello' },
];

setupTestDb();

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
      kind: 'native',
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
    expect(prompt).toContain(
      'Do not call their tools unless you first call `activate_toolset` again',
    );
    expect(prompt).toContain('browser_open');
  });
});

describe('SessionContext expired toolset handling', () => {
  beforeEach(() => {
    clearToolsets();
  });

  test('adds expiry notice next turn and does not load expired tools', async () => {
    const sessionId = 'ses_expired_toolsets' as never;
    getDb().insert(sessions).values({ id: sessionId, title: 'Expired toolsets test' }).run();

    registerToolset({
      id: 'browser',
      kind: 'native',
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

    const assembled = await SessionContext.create({
      sessionId,
      messageId: 'msg_expired_toolsets' as never,
      streamRunId: 'run_expired_toolsets',
      credentials: CREDENTIALS,
      modelId: 'openai/gpt-5.3-codex',
      abortSignal: new AbortController().signal,
      llmMessages: STUB_MESSAGES,
    }).assemble();

    const semiStaticContent = assembled.messages
      .filter((m) => m.role === 'system')
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n');
    expect(semiStaticContent).toContain('Toolset Expiry Notice');
    expect(assembled.toolsetManager.getActiveTools()).not.toHaveProperty('browser_open');
    expect(getSessionToolsetState(sessionId).expired).toEqual([
      { id: 'browser', expiredAtTurn: 1, toolNames: ['browser_open'] },
    ]);
  });

  test('restores ttl toolsets before expiry and expires them on turn N', async () => {
    const sessionId = 'ses_ttl_toolsets' as never;
    getDb().insert(sessions).values({ id: sessionId, title: 'TTL toolsets test' }).run();

    registerToolset({
      id: 'browser',
      kind: 'native',
      name: 'Browser',
      description: 'Browser toolset',
      tools: () => [{ name: 'browser_open', description: 'open' }],
      activate: async () => ({ browser_open: makeTool('open') }),
    } satisfies Toolset);
    setSessionToolsetState(sessionId, {
      turnCounter: 2,
      active: [{ id: 'browser', scope: 'ttl_turns', expiresAtTurn: 2 }],
      expired: [],
    });

    const restored = await SessionContext.create({
      sessionId,
      messageId: 'msg_ttl_restore' as never,
      streamRunId: 'run_ttl_restore',
      credentials: CREDENTIALS,
      modelId: 'openai/gpt-5.3-codex',
      abortSignal: new AbortController().signal,
      llmMessages: STUB_MESSAGES,
    }).assemble();

    expect(restored.toolsetManager.getActiveTools()).toHaveProperty('browser_open');

    setSessionToolsetState(sessionId, {
      turnCounter: 3,
      active: [{ id: 'browser', scope: 'ttl_turns', expiresAtTurn: 2 }],
      expired: [],
    });

    const expired = await SessionContext.create({
      sessionId,
      messageId: 'msg_ttl_expire' as never,
      streamRunId: 'run_ttl_expire',
      credentials: CREDENTIALS,
      modelId: 'openai/gpt-5.3-codex',
      abortSignal: new AbortController().signal,
      llmMessages: STUB_MESSAGES,
    }).assemble();

    const semiStaticContent = expired.messages
      .filter((m) => m.role === 'system')
      .map((m) => (typeof m.content === 'string' ? m.content : ''))
      .join('\n');
    expect(semiStaticContent).toContain('Toolset Expiry Notice');
    expect(expired.toolsetManager.getActiveTools()).not.toHaveProperty('browser_open');
  });

  test('does not restore excluded active toolsets', async () => {
    const sessionId = 'ses_excluded_toolsets' as never;
    getDb().insert(sessions).values({ id: sessionId, title: 'Excluded toolsets test' }).run();

    registerToolset({
      id: 'browser',
      kind: 'native',
      name: 'Browser',
      description: 'Browser toolset',
      tools: () => [{ name: 'browser_open', description: 'open' }],
      activate: async () => ({ browser_open: makeTool('open') }),
    } satisfies Toolset);

    const assembled = await SessionContext.create({
      sessionId,
      messageId: 'msg_excluded_toolsets' as never,
      streamRunId: 'run_excluded_toolsets',
      credentials: CREDENTIALS,
      modelId: 'openai/gpt-5.3-codex',
      abortSignal: new AbortController().signal,
      llmMessages: STUB_MESSAGES,
      activeToolsetIds: ['browser'],
      excludedToolsetIds: ['browser'],
    }).assemble();

    expect(assembled.toolsetManager.getActiveTools()).not.toHaveProperty('browser_open');
  });
});
