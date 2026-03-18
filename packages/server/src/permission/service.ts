import { and, eq, isNull } from 'drizzle-orm';

import type { PrefixedString } from '@openwork/shared';
import type {
  AgentPermissionValue,
  PermissionDecisionResult,
  PermissionResponse,
  PermissionResponseStatus,
  PermissionSuggestion,
} from '@openwork/shared';
import { createAgentPermissionId, createPermissionResponseId } from '@openwork/shared';

import { getDb } from '@/db/client.js';
import { agentPermissions, permissionResponses } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { broadcast } from '@/lib/sse.js';
import { PermissionResponseAbortedError } from '@/lib/stream-errors.js';
import { resolvePermissionFromRules } from '@/permission/policy.js';

const log = Log.create({ service: 'permission-service' });

type PermissionResponseRow = typeof permissionResponses.$inferSelect;

function toPermissionResponse(row: PermissionResponseRow): PermissionResponse {
  return {
    ...row,
    resolvedAt: row.resolvedAt ?? undefined,
  };
}

type PendingPermissionResponse = {
  resolve: (decision: PermissionDecisionResult) => void;
  reject: (error: Error) => void;
  streamRunId?: string;
};

const pendingPermissionResponses = new Map<PrefixedString<'permres'>, PendingPermissionResponse>();

type SetPermissionRule = {
  permission: AgentPermissionValue;
  pattern?: string | null;
};

async function upsertAgentPermission(opts: {
  agentId: PrefixedString<'agt'>;
  toolName: string;
  permission: AgentPermissionValue;
  pattern: string | null;
}): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const where =
    opts.pattern === null
      ? and(
          eq(agentPermissions.agentId, opts.agentId),
          eq(agentPermissions.toolName, opts.toolName),
          isNull(agentPermissions.pattern),
        )
      : and(
          eq(agentPermissions.agentId, opts.agentId),
          eq(agentPermissions.toolName, opts.toolName),
          eq(agentPermissions.pattern, opts.pattern),
        );

  const existing = await db
    .select({ id: agentPermissions.id })
    .from(agentPermissions)
    .where(where)
    .then((rows) => rows[0]);

  if (existing) {
    await db
      .update(agentPermissions)
      .set({
        permission: opts.permission,
        updatedAt: now,
      })
      .where(eq(agentPermissions.id, existing.id));
    return;
  }

  await db.insert(agentPermissions).values({
    id: createAgentPermissionId(),
    agentId: opts.agentId,
    toolName: opts.toolName,
    permission: opts.permission,
    pattern: opts.pattern,
    createdAt: now,
    updatedAt: now,
  });
}

export async function getAgentPermissionDecision(opts: {
  agentId: PrefixedString<'agt'>;
  toolName: string;
  patternTargets?: string[];
}): Promise<AgentPermissionValue> {
  const db = getDb();
  const rows = await db
    .select()
    .from(agentPermissions)
    .where(
      and(eq(agentPermissions.agentId, opts.agentId), eq(agentPermissions.toolName, opts.toolName)),
    );

  return resolvePermissionFromRules(rows, opts.patternTargets ?? []);
}

export async function requestPermissionResponse(opts: {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  streamRunId?: string;
  agentId: PrefixedString<'agt'>;
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

  await db.insert(permissionResponses).values({
    id,
    sessionId: opts.sessionId,
    messageId: opts.messageId,
    agentId: opts.agentId,
    toolCallId: opts.toolCallId,
    toolName: opts.toolName,
    toolInput: opts.toolInput,
    systemReminder: opts.systemReminder,
    suggestion: opts.suggestion ?? null,
    status: 'pending',
    createdAt: now,
  });

  const [row] = await db.select().from(permissionResponses).where(eq(permissionResponses.id, id));
  if (!row) throw new Error('Permission response not found after create');

  await broadcast('permission-response-requested', {
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

  return new Promise((resolve, reject) => {
    const abortHandler = () => {
      pendingPermissionResponses.delete(id);
      reject(new PermissionResponseAbortedError());
    };

    if (opts.abortSignal) {
      if (opts.abortSignal.aborted) {
        reject(new PermissionResponseAbortedError());
        return;
      }
      opts.abortSignal.addEventListener('abort', abortHandler, { once: true });
    }

    pendingPermissionResponses.set(id, {
      streamRunId: opts.streamRunId,
      resolve: (decision) => {
        opts.abortSignal?.removeEventListener('abort', abortHandler);
        resolve(decision);
      },
      reject: (error) => {
        opts.abortSignal?.removeEventListener('abort', abortHandler);
        reject(error);
      },
    });
  });
}

async function resolvePermissionResponse(opts: {
  permissionResponseId: PrefixedString<'permres'>;
  status: PermissionResponseStatus;
  decision: PermissionDecisionResult;
  entry?: string;
  setPermission?: SetPermissionRule;
}): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const [existing] = await db
    .select()
    .from(permissionResponses)
    .where(eq(permissionResponses.id, opts.permissionResponseId));

  if (!existing) {
    throw new Error(`Permission response not found: ${opts.permissionResponseId}`);
  }

  if (opts.setPermission) {
    await upsertAgentPermission({
      agentId: existing.agentId,
      toolName: existing.toolName,
      permission: opts.setPermission.permission,
      pattern: opts.setPermission.pattern ?? null,
    });
  }

  await db
    .update(permissionResponses)
    .set({
      status: opts.status,
      entry: opts.entry ?? null,
      resolvedAt: now,
    })
    .where(eq(permissionResponses.id, opts.permissionResponseId));

  const [permissionResponse] = await db
    .select()
    .from(permissionResponses)
    .where(eq(permissionResponses.id, opts.permissionResponseId));

  await broadcast('permission-response-resolved', {
    permissionResponseId: opts.permissionResponseId,
    sessionId: permissionResponse?.sessionId ?? existing.sessionId,
  });

  const pending = pendingPermissionResponses.get(opts.permissionResponseId);
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

  if (pending) {
    pending.resolve(opts.decision);
    pendingPermissionResponses.delete(opts.permissionResponseId);
  }
}

export async function allowPermissionResponse(
  permissionResponseId: PrefixedString<'permres'>,
  setPermission?: SetPermissionRule,
): Promise<void> {
  await resolvePermissionResponse({
    permissionResponseId,
    status: 'allowed',
    decision: { decision: 'allow' },
    setPermission,
  });
}

export async function rejectPermissionResponse(
  permissionResponseId: PrefixedString<'permres'>,
  setPermission?: SetPermissionRule,
): Promise<void> {
  await resolvePermissionResponse({
    permissionResponseId,
    status: 'rejected',
    decision: { decision: 'reject' },
    setPermission,
  });
}

export async function alternativePermissionResponse(
  permissionResponseId: PrefixedString<'permres'>,
  entry: string,
): Promise<void> {
  await resolvePermissionResponse({
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
    .where(eq(permissionResponses.sessionId, sessionId));
  return rows.filter((p) => p.status === 'pending').map(toPermissionResponse);
}

export async function abortPermissionResponses(sessionId: PrefixedString<'ses'>): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const all = await db
    .select()
    .from(permissionResponses)
    .where(eq(permissionResponses.sessionId, sessionId));
  const pending = all.filter((p) => p.status === 'pending');
  if (pending.length === 0) return;

  await db
    .update(permissionResponses)
    .set({ status: 'rejected', resolvedAt: now })
    .where(eq(permissionResponses.sessionId, sessionId));

  for (const row of pending) {
    const id = row.id;
    const entry = pendingPermissionResponses.get(id);
    const streamRunId = entry?.streamRunId;
    if (entry) {
      entry.reject(
        new PermissionResponseAbortedError('Permission response aborted by session abort'),
      );
      pendingPermissionResponses.delete(id);
    }

    await broadcast('permission-response-resolved', {
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
  }

  log.info(
    {
      event: 'stream.permission.aborted',
      sessionId,
      count: pending.length,
    },
    'aborted pending permission responses',
  );
}
