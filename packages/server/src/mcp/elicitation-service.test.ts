import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { mcpElicitations, mcpServers } from '@/db/schema/mcp.js';
import { sessions } from '@/db/schema/sessions.js';
import { setupTestDb } from '@/db/test-helpers.js';
import { interactionBroker } from '@/lib/interactions/broker.js';
import { internalBus } from '@/lib/internal-bus.js';
import type { InternalEventMap } from '@/lib/internal-bus.js';
import { abortMcpElicitations, requestMcpElicitation, resolveMcpElicitation } from '@/mcp/elicitation-service.js';
import type { ElicitRequest } from '@modelcontextprotocol/sdk/types.js';

setupTestDb();

const sessionId = 'ses_elicitation' as PrefixedString<'ses'>;
const serverId = 'mcp_elicitation' as PrefixedString<'mcp'>;
let requested: InternalEventMap['mcp.elicitation.requested'][] = [];
let cleanup: (() => void) | undefined;

async function waitForRequest(): Promise<InternalEventMap['mcp.elicitation.requested']> {
  while (!requested[0]) await new Promise((resolve) => setTimeout(resolve, 5));
  return requested[0];
}

function request(params: ElicitRequest['params'], abortSignal?: AbortSignal) {
  return requestMcpElicitation({ sessionId, serverId, serverName: 'Test MCP', params, abortSignal });
}

describe('MCP elicitation service', () => {
  beforeEach(async () => {
    requested = [];
    cleanup?.();
    cleanup = internalBus.onSync('mcp.elicitation.requested', (event) => requested.push(event));
    await getDb().insert(sessions).values({ id: sessionId, title: 'Elicitation session' });
    await getDb()
      .insert(mcpServers)
      .values({
        id: serverId,
        name: 'Test MCP',
        transport: 'http',
        url: 'https://mcp.example.com',
        authConfig: { type: 'none' },
        authStatus: 'none',
      });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    interactionBroker.clear();
  });

  test('broadcasts a form request and resolves accepted schema-valid content', async () => {
    const pending = request({
      mode: 'form',
      message: 'Choose a project',
      requestedSchema: {
        type: 'object',
        properties: { project: { type: 'string', minLength: 2 } },
        required: ['project'],
      },
    });
    const event = await waitForRequest();

    expect(event.elicitation).toMatchObject({
      sessionId,
      serverId,
      serverName: 'Test MCP',
      mode: 'form',
      message: 'Choose a project',
      status: 'pending',
    });

    expect(await resolveMcpElicitation(event.elicitation.id, 'accept', { project: 'Stitch' })).toEqual({
      data: null,
      error: null,
    });
    expect(pending).resolves.toEqual({ action: 'accept', content: { project: 'Stitch' } });

    const row = (await getDb().select().from(mcpElicitations).where(eq(mcpElicitations.id, event.elicitation.id))).at(
      0,
    );
    expect(row).toMatchObject({ status: 'accepted', content: { project: 'Stitch' } });
  });

  test('keeps a form request pending when accepted content fails its schema', async () => {
    const pending = request({
      message: 'Enter a name',
      requestedSchema: { type: 'object', properties: { name: { type: 'string', minLength: 3 } }, required: ['name'] },
    });
    const event = await waitForRequest();

    const result = await resolveMcpElicitation(event.elicitation.id, 'accept', { name: 'x' });
    expect(result.error?.status).toBe(400);
    expect(interactionBroker.get(event.elicitation.id)).toBeDefined();

    await resolveMcpElicitation(event.elicitation.id, 'cancel');
    expect(pending).resolves.toEqual({ action: 'cancel' });
  });

  test('resolves URL consent without returning content', async () => {
    const pending = request({
      mode: 'url',
      message: 'Connect your account',
      elicitationId: 'external-id',
      url: 'https://example.com/connect',
    });
    const event = await waitForRequest();

    expect(event.elicitation).toMatchObject({
      mode: 'url',
      url: 'https://example.com/connect',
      externalElicitationId: 'external-id',
    });
    expect(await resolveMcpElicitation(event.elicitation.id, 'accept')).toEqual({ data: null, error: null });
    expect(pending).resolves.toEqual({ action: 'accept' });
  });

  test('cancels pending requests when the session is aborted', async () => {
    const pending = request({
      message: 'Enter a name',
      requestedSchema: { type: 'object', properties: { name: { type: 'string' } } },
    });
    const event = await waitForRequest();

    await abortMcpElicitations(sessionId);
    expect(pending).rejects.toThrow('Interaction aborted');

    const row = (await getDb().select().from(mcpElicitations).where(eq(mcpElicitations.id, event.elicitation.id))).at(
      0,
    );
    expect(row?.status).toBe('cancelled');
  });
});
