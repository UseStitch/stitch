import { and, eq, isNull } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';
import { createPermissionResponseId, createPermissionRuleId } from '@stitch/shared/id';
import type {
  ToolPermission,
  ToolPermissionValue,
  PermissionDecisionResult,
  PermissionResponse,
  PermissionSuggestion,
} from '@stitch/shared/permissions/types';

import { getDb } from '@/db/client.js';
import { toolPermissions } from '@/db/schema/permissions.js';
import { interactionBroker } from '@/lib/interactions/broker.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { PermissionResponseAbortedError } from '@/llm/stream/errors.js';
import { resolvePermissionFromRules } from '@/permission/policy.js';

const log = Log.create({ service: 'permission-service' });
const pendingPermissionRequests = new Map<string, Promise<PermissionDecisionResult>>();

const permissionResponseStore = new Map<PrefixedString<'permres'>, PermissionResponse>();

type SetPermissionRule = { permission: ToolPermissionValue; pattern?: string | null };

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
      set: { permission: opts.permission, updatedAt: now },
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
  const rows = await db.select().from(toolPermissions).where(eq(toolPermissions.toolName, opts.toolName));

  return resolvePermissionFromRules(rows, opts.patternTargets ?? []);
}

type RequestPermissionResponseOptions = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId?: string;
  toolCallId: string;
  toolName: string;
  toolInput: unknown;
  systemReminder: string;
  suggestion?: PermissionSuggestion | null;
  dedupeKey?: string;
  abortSignal?: AbortSignal;
};

async function createPermissionResponse(opts: RequestPermissionResponseOptions): Promise<PermissionDecisionResult> {
  const id = createPermissionResponseId();

  const permissionResponse: PermissionResponse = {
    id,
    sessionId: opts.sessionId,
    messageId: opts.messageId,
    toolCallId: opts.toolCallId,
    toolName: opts.toolName,
    toolInput: opts.toolInput,
    systemReminder: opts.systemReminder,
    suggestion: opts.suggestion ?? null,
  };

  permissionResponseStore.set(id, permissionResponse);

  internalBus.emit('permission.requested', { permissionResponse });

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

export async function requestPermissionResponse(
  opts: RequestPermissionResponseOptions,
): Promise<PermissionDecisionResult> {
  if (!opts.dedupeKey) {
    return createPermissionResponse(opts);
  }

  const existing = pendingPermissionRequests.get(opts.dedupeKey);
  if (existing) return existing;

  const promise = createPermissionResponse(opts).finally(() => {
    pendingPermissionRequests.delete(opts.dedupeKey!);
  });
  pendingPermissionRequests.set(opts.dedupeKey, promise);
  return promise;
}

async function resolvePermissionResponse(opts: {
  permissionResponseId: PrefixedString<'permres'>;
  decision: PermissionDecisionResult;
  setPermission?: SetPermissionRule;
}): Promise<ServiceResult<null>> {
  const existing = permissionResponseStore.get(opts.permissionResponseId);

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

  permissionResponseStore.delete(opts.permissionResponseId);

  internalBus.emit('permission.resolved', {
    permissionResponseId: opts.permissionResponseId,
    sessionId: existing.sessionId,
  });

  const pending = interactionBroker.get(opts.permissionResponseId);
  log.info(
    {
      event: 'stream.permission.resolved',
      streamRunId: pending?.streamRunId,
      permissionResponseId: opts.permissionResponseId,
      sessionId: existing.sessionId,
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
  return resolvePermissionResponse({ permissionResponseId, decision: { decision: 'allow' }, setPermission });
}

export async function rejectPermissionResponse(
  permissionResponseId: PrefixedString<'permres'>,
  setPermission?: SetPermissionRule,
): Promise<ServiceResult<null>> {
  return resolvePermissionResponse({ permissionResponseId, decision: { decision: 'reject' }, setPermission });
}

export async function alternativePermissionResponse(
  permissionResponseId: PrefixedString<'permres'>,
  entry: string,
): Promise<ServiceResult<null>> {
  return resolvePermissionResponse({ permissionResponseId, decision: { decision: 'alternative', entry } });
}

export async function getPendingPermissionResponses(
  sessionId: PrefixedString<'ses'>,
): Promise<ServiceResult<PermissionResponse[]>> {
  return ok([...permissionResponseStore.values()].filter((r) => r.sessionId === sessionId));
}

export async function abortPermissionResponses(sessionId: PrefixedString<'ses'>): Promise<void> {
  const pending = [...permissionResponseStore.values()].filter((r) => r.sessionId === sessionId);

  if (pending.length === 0) return;

  // Remove from in-memory store
  for (const row of pending) {
    permissionResponseStore.delete(row.id);
  }

  const aborted = interactionBroker.abortSession({
    sessionId,
    kind: 'permission',
    error: new PermissionResponseAbortedError('Permission response aborted by session abort'),
  });
  const streamRunIds = new Map(aborted.map((entry) => [entry.id, entry.streamRunId]));

  for (const row of pending) {
    const streamRunId = streamRunIds.get(row.id);

    internalBus.emit('permission.resolved', { permissionResponseId: row.id, sessionId });

    log.info(
      { event: 'stream.permission.aborted', streamRunId, sessionId, permissionResponseId: row.id },
      'permission aborted',
    );
  }

  log.info(
    { event: 'stream.permission.aborted', sessionId, count: pending.length },
    'aborted pending permission responses',
  );
}
