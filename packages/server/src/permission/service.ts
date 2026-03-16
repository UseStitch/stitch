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
import { resolvePermissionFromRules } from '@/permission/policy.js';
import { broadcast } from '@/lib/sse.js';

const log = Log.create({ service: 'permission-service' });

type PendingPermissionResponse = {
  resolve: (decision: PermissionDecisionResult) => void;
  reject: (error: Error) => void;
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
  const now = new Date();

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
  const now = new Date();

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
    permissionResponse: row,
  });

  log.info('permission requested', {
    id,
    sessionId: opts.sessionId,
    messageId: opts.messageId,
    toolCallId: opts.toolCallId,
    toolName: opts.toolName,
  });

  return new Promise((resolve, reject) => {
    const abortHandler = () => {
      pendingPermissionResponses.delete(id);
      reject(new DOMException('Permission response aborted', 'AbortError'));
    };

    if (opts.abortSignal) {
      if (opts.abortSignal.aborted) {
        reject(new DOMException('Permission response aborted', 'AbortError'));
        return;
      }
      opts.abortSignal.addEventListener('abort', abortHandler, { once: true });
    }

    pendingPermissionResponses.set(id, {
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
  const now = new Date();

  const [existing] = await db
    .select()
    .from(permissionResponses)
    .where(eq(permissionResponses.id, opts.permissionResponseId));

  if (!existing) {
    throw new Error(`Permission response not found: ${opts.permissionResponseId}`);
  }

  if (opts.setPermission) {
    await upsertAgentPermission({
      agentId: existing.agentId as PrefixedString<'agt'>,
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
    sessionId: permissionResponse?.sessionId ?? '',
  });

  const pending = pendingPermissionResponses.get(opts.permissionResponseId);
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
  return rows.filter((p) => p.status === 'pending') as PermissionResponse[];
}

export async function abortPermissionResponses(sessionId: PrefixedString<'ses'>): Promise<void> {
  const db = getDb();
  const now = new Date();
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
    const id = row.id as PrefixedString<'permres'>;
    const entry = pendingPermissionResponses.get(id);
    if (entry) {
      entry.reject(new Error('Permission response rejected by user'));
      pendingPermissionResponses.delete(id);
    }

    await broadcast('permission-response-resolved', {
      permissionResponseId: row.id,
      sessionId,
    });
  }

  log.info('aborted pending permission responses', { sessionId, count: pending.length });
}
