import { and, eq, isNull } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';
import { createPermissionResponseId, createPermissionRuleId } from '@stitch/shared/id';
import type {
  ToolPermission,
  ToolPermissionValue,
  PermissionDecisionResult,
  PermissionResponse,
  PermissionResponseStatus,
  PermissionSuggestion,
} from '@stitch/shared/permissions/types';

import { getDb } from '@/db/client.js';
import { permissionResponses, toolPermissions } from '@/db/schema.js';
import { interactionBroker } from '@/interactions/broker.js';
import * as Events from '@/lib/events.js';
import * as Log from '@/lib/log.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { PermissionResponseAbortedError } from '@/llm/stream/errors.js';
import { resolvePermissionFromRules } from '@/permission/policy.js';

const log = Log.create({ service: 'permission-service' });

type PermissionResponseRow = typeof permissionResponses.$inferSelect;

function toPermissionResponse(row: PermissionResponseRow): PermissionResponse {
  return {
    ...row,
    resolvedAt: row.resolvedAt ?? undefined,
  };
}

type SetPermissionRule = {
  permission: ToolPermissionValue;
  pattern?: string | null;
};

export async function upsertPerm(opts: {
  toolName: string;
  permission: ToolPermissionValue;
  pattern: string | null;
}): Promise<void> {
  const db = getDb();
  const now = Date.now();

  // SQLite NULL != NULL in unique indexes, so onConflictDoUpdate never fires for
  // pattern IS NULL. Delete the existing global rule before inserting.
  if (opts.pattern === null) {
    await db
      .delete(toolPermissions)
      .where(and(eq(toolPermissions.toolName, opts.toolName), isNull(toolPermissions.pattern)));
  }

  await db
    .insert(toolPermissions)
    .values({
      id: createPermissionRuleId(),
      toolName: opts.toolName,
      permission: opts.permission,
      pattern: opts.pattern,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [toolPermissions.toolName, toolPermissions.pattern],
      set: {
        permission: opts.permission,
        updatedAt: now,
      },
    });
}

export async function getPerms(): Promise<ToolPermission[]> {
  const db = getDb();
  const rows = await db.select().from(toolPermissions);
  return rows;
}

export async function deletePerm(permissionId: PrefixedString<'perm'>): Promise<void> {
  const db = getDb();
  await db.delete(toolPermissions).where(eq(toolPermissions.id, permissionId));
}

export async function getPermissionDecision(opts: {
  toolName: string;
  patternTargets?: string[];
}): Promise<ToolPermissionValue> {
  const db = getDb();
  const rows = await db
    .select()
    .from(toolPermissions)
    .where(eq(toolPermissions.toolName, opts.toolName));

  return resolvePermissionFromRules(rows, opts.patternTargets ?? []);
}

export async function requestPermissionResponse(opts: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId?: string;
  toolCallId: string;
  toolName: string;
  toolInput: unknown;
  systemReminder: string;
  suggestion?: PermissionSuggestion | null;
  abortSignal?: AbortSignal;
}): Promise<PermissionDecisionResult> {
  const db = getDb();
  const id = createPermissionResponseId();
  const now = Date.now();

  const [row] = await db
    .insert(permissionResponses)
    .values({
      id,
      sessionId: opts.sessionId,
      messageId: opts.messageId,
      toolCallId: opts.toolCallId,
      toolName: opts.toolName,
      toolInput: opts.toolInput,
      systemReminder: opts.systemReminder,
      suggestion: opts.suggestion ?? null,
      status: 'pending',
      createdAt: now,
    })
    .returning();

  if (!row) throw new Error('Permission response not found after create');

  Events.emit('permission-response-requested', {
    permissionResponse: toPermissionResponse(row),
  });

  log.info(
    {
      id,
      streamRunId: opts.streamRunId,
      sessionId: opts.sessionId,
      messageId: opts.messageId,
      toolCallId: opts.toolCallId,
      toolName: opts.toolName,
      event: 'stream.permission.requested',
    },
    'permission requested',
  );

  return interactionBroker.wait<PermissionDecisionResult>({
    id,
    kind: 'permission',
    sessionId: opts.sessionId,
    streamRunId: opts.streamRunId,
    abortSignal: opts.abortSignal,
    abortError: () => new PermissionResponseAbortedError(),
  });
}

async function resolvePermissionResponse(opts: {
  permissionResponseId: PrefixedString<'permres'>;
  status: PermissionResponseStatus;
  decision: PermissionDecisionResult;
  entry?: string;
  setPermission?: SetPermissionRule;
}): Promise<ServiceResult<null>> {
  const db = getDb();
  const now = Date.now();

  const [existing] = await db
    .select()
    .from(permissionResponses)
    .where(eq(permissionResponses.id, opts.permissionResponseId));

  if (!existing) {
    return err(`Permission response not found: ${opts.permissionResponseId}`, 404);
  }

  if (opts.setPermission) {
    await upsertPerm({
      toolName: existing.toolName,
      permission: opts.setPermission.permission,
      pattern: opts.setPermission.pattern ?? null,
    });
  }

  const [permissionResponse] = await db
    .update(permissionResponses)
    .set({
      status: opts.status,
      entry: opts.entry ?? null,
      resolvedAt: now,
    })
    .where(eq(permissionResponses.id, opts.permissionResponseId))
    .returning();

  Events.emit('permission-response-resolved', {
    permissionResponseId: opts.permissionResponseId,
    sessionId: permissionResponse?.sessionId ?? existing.sessionId,
  });

  const pending = interactionBroker.get(opts.permissionResponseId);
  log.info(
    {
      event: 'stream.permission.resolved',
      streamRunId: pending?.streamRunId,
      permissionResponseId: opts.permissionResponseId,
      sessionId: permissionResponse?.sessionId ?? existing.sessionId,
      status: opts.status,
    },
    'permission resolved',
  );

  interactionBroker.resolve(opts.permissionResponseId, opts.decision);

  return ok(null);
}

export async function allowPermissionResponse(
  permissionResponseId: PrefixedString<'permres'>,
  setPermission?: SetPermissionRule,
): Promise<ServiceResult<null>> {
  return resolvePermissionResponse({
    permissionResponseId,
    status: 'allowed',
    decision: { decision: 'allow' },
    setPermission,
  });
}

export async function rejectPermissionResponse(
  permissionResponseId: PrefixedString<'permres'>,
  setPermission?: SetPermissionRule,
): Promise<ServiceResult<null>> {
  return resolvePermissionResponse({
    permissionResponseId,
    status: 'rejected',
    decision: { decision: 'reject' },
    setPermission,
  });
}

export async function alternativePermissionResponse(
  permissionResponseId: PrefixedString<'permres'>,
  entry: string,
): Promise<ServiceResult<null>> {
  return resolvePermissionResponse({
    permissionResponseId,
    status: 'alternative',
    entry,
    decision: { decision: 'alternative', entry },
  });
}

export async function getPendingPermissionResponses(
  sessionId: PrefixedString<'ses'>,
): Promise<PermissionResponse[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(permissionResponses)
    .where(
      and(eq(permissionResponses.sessionId, sessionId), eq(permissionResponses.status, 'pending')),
    );

  return rows.map(toPermissionResponse);
}

export async function abortPermissionResponses(sessionId: PrefixedString<'ses'>): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const pending = await db
    .select()
    .from(permissionResponses)
    .where(
      and(eq(permissionResponses.sessionId, sessionId), eq(permissionResponses.status, 'pending')),
    );

  if (pending.length === 0) return;

  await db
    .update(permissionResponses)
    .set({ status: 'rejected', resolvedAt: now })
    .where(
      and(eq(permissionResponses.sessionId, sessionId), eq(permissionResponses.status, 'pending')),
    );

  const aborted = interactionBroker.abortSession({
    sessionId,
    kind: 'permission',
    error: new PermissionResponseAbortedError('Permission response aborted by session abort'),
  });
  const streamRunIds = new Map(aborted.map((entry) => [entry.id, entry.streamRunId]));

  await Promise.all(
    pending.map(async (row) => {
      const id = row.id;
      const streamRunId = streamRunIds.get(id);

      Events.emit('permission-response-resolved', {
        permissionResponseId: row.id,
        sessionId,
      });

      log.info(
        {
          event: 'stream.permission.aborted',
          streamRunId,
          sessionId,
          permissionResponseId: row.id,
        },
        'permission aborted',
      );
    }),
  );

  log.info(
    {
      event: 'stream.permission.aborted',
      sessionId,
      count: pending.length,
    },
    'aborted pending permission responses',
  );
}
