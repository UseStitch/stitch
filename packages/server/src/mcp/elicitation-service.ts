import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { and, eq } from 'drizzle-orm';

import { createMcpElicitationId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type {
  McpElicitationAction,
  McpElicitationContent,
  McpElicitationRequest,
  McpElicitationStatus,
} from '@stitch/shared/mcp/types';

import { getDb } from '@/db/client.js';
import { mcpElicitations } from '@/db/schema/mcp.js';
import { interactionBroker } from '@/lib/interactions/broker.js';
import { internalBus } from '@/lib/internal-bus.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import type { ElicitRequest, ElicitResult } from '@modelcontextprotocol/sdk/types.js';

type McpElicitationRow = typeof mcpElicitations.$inferSelect;

const validator = new AjvJsonSchemaValidator();

function toRequest(row: McpElicitationRow): McpElicitationRequest {
  return {
    ...row,
    requestedSchema: row.requestedSchema ?? undefined,
    url: row.url ?? undefined,
    externalElicitationId: row.externalElicitationId ?? undefined,
    content: row.content ?? undefined,
    resolvedAt: row.resolvedAt ?? undefined,
  };
}

function statusForAction(action: McpElicitationAction): McpElicitationStatus {
  if (action === 'accept') return 'accepted';
  if (action === 'decline') return 'declined';
  return 'cancelled';
}

function validateResponse(
  elicitation: McpElicitationRow,
  action: McpElicitationAction,
  content: McpElicitationContent | undefined,
): ServiceResult<null> {
  if (elicitation.status !== 'pending') return err('MCP elicitation has already been resolved', 409);
  if (action !== 'accept') return ok(null);
  if (elicitation.mode === 'url') {
    return content === undefined ? ok(null) : err('URL elicitation responses cannot include content', 400);
  }
  if (!content || !elicitation.requestedSchema) return err('Form elicitation responses require content', 400);

  const result = validator.getValidator<McpElicitationContent>(elicitation.requestedSchema)(content);
  return result.valid ? ok(null) : err(result.errorMessage, 400);
}

export async function requestMcpElicitation(opts: {
  sessionId: PrefixedString<'ses'>;
  serverId: PrefixedString<'mcp'>;
  serverName: string;
  params: ElicitRequest['params'];
  abortSignal?: AbortSignal;
}): Promise<ElicitResult> {
  const db = getDb();
  const id = createMcpElicitationId();
  const mode = opts.params.mode ?? 'form';
  const row = (
    await db
      .insert(mcpElicitations)
      .values({
        id,
        sessionId: opts.sessionId,
        serverId: opts.serverId,
        serverName: opts.serverName,
        mode,
        message: opts.params.message,
        requestedSchema: opts.params.mode === 'url' ? undefined : opts.params.requestedSchema,
        url: opts.params.mode === 'url' ? opts.params.url : undefined,
        externalElicitationId: opts.params.mode === 'url' ? opts.params.elicitationId : undefined,
        status: 'pending',
        createdAt: Date.now(),
      })
      .returning()
  ).at(0);

  if (!row) throw new Error(`MCP elicitation not found after create: ${id}`);

  internalBus.emit('mcp.elicitation.requested', { elicitation: toRequest(row) });
  return interactionBroker.wait<ElicitResult>({
    id,
    kind: 'mcp_elicitation',
    sessionId: opts.sessionId,
    abortSignal: opts.abortSignal,
  });
}

export async function resolveMcpElicitation(
  id: PrefixedString<'mcpel'>,
  action: McpElicitationAction,
  content?: McpElicitationContent,
): Promise<ServiceResult<null>> {
  const db = getDb();
  const elicitation = (await db.select().from(mcpElicitations).where(eq(mcpElicitations.id, id))).at(0);
  if (!elicitation) return err(`MCP elicitation not found: ${id}`, 404);

  const validation = validateResponse(elicitation, action, content);
  if (validation.error) return validation;

  await db
    .update(mcpElicitations)
    .set({ status: statusForAction(action), content: action === 'accept' ? content : null, resolvedAt: Date.now() })
    .where(eq(mcpElicitations.id, id));

  internalBus.emit('mcp.elicitation.resolved', { elicitationId: id, sessionId: elicitation.sessionId, action });
  interactionBroker.resolve(id, action === 'accept' && content ? { action, content } : { action });
  return ok(null);
}

export async function getPendingMcpElicitations(
  sessionId: PrefixedString<'ses'>,
): Promise<ServiceResult<McpElicitationRequest[]>> {
  const rows = await getDb()
    .select()
    .from(mcpElicitations)
    .where(and(eq(mcpElicitations.sessionId, sessionId), eq(mcpElicitations.status, 'pending')));
  return ok(rows.map(toRequest));
}

export async function abortMcpElicitations(sessionId: PrefixedString<'ses'>): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: mcpElicitations.id })
    .from(mcpElicitations)
    .where(and(eq(mcpElicitations.sessionId, sessionId), eq(mcpElicitations.status, 'pending')));
  if (rows.length === 0) return;

  await db
    .update(mcpElicitations)
    .set({ status: 'cancelled', resolvedAt: Date.now() })
    .where(and(eq(mcpElicitations.sessionId, sessionId), eq(mcpElicitations.status, 'pending')));

  interactionBroker.abortSession({ sessionId, kind: 'mcp_elicitation' });
  for (const row of rows) {
    internalBus.emit('mcp.elicitation.resolved', { elicitationId: row.id, sessionId, action: 'cancel' });
  }
}
