import { asc, eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';
import { createTodoId } from '@stitch/shared/id';
import type { SessionTodo, TodoInput } from '@stitch/shared/todos/types';

import { getDb } from '@/db/client.js';
import { sessionTodos, sessions } from '@/db/schema/sessions.js';
import { internalBus } from '@/lib/internal-bus.js';
import { err, ok, type ServiceResult } from '@/lib/service-result.js';

export async function listSessionTodos(sessionId: PrefixedString<'ses'>): Promise<ServiceResult<SessionTodo[]>> {
  const db = getDb();
  const rows = await db
    .select()
    .from(sessionTodos)
    .where(eq(sessionTodos.sessionId, sessionId))
    .orderBy(asc(sessionTodos.sortOrder), asc(sessionTodos.createdAt));

  return ok(rows);
}

export async function replaceSessionTodos(input: {
  sessionId: PrefixedString<'ses'>;
  todos: TodoInput[];
  broadcastUpdate?: boolean;
}): Promise<ServiceResult<SessionTodo[]>> {
  const db = getDb();
  const [session] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, input.sessionId))
    .limit(1);
  if (!session) return err(`Session not found: ${input.sessionId}`, 404);

  const now = Date.now();
  const rows = input.todos.map((todo, index) => ({
    id: todo.id ?? createTodoId(),
    sessionId: input.sessionId,
    content: todo.content,
    status: todo.status,
    priority: todo.priority,
    sortOrder: index,
    createdAt: now,
    updatedAt: now,
  }));

  const updated = await db.transaction(async (tx) => {
    await tx.delete(sessionTodos).where(eq(sessionTodos.sessionId, input.sessionId));
    if (rows.length === 0) return [];
    return tx.insert(sessionTodos).values(rows).returning();
  });

  if (input.broadcastUpdate ?? true) {
    internalBus.emit('session.todos.updated', { sessionId: input.sessionId });
  }

  return ok(updated);
}

export async function getSessionTodosPromptBlock(sessionId: PrefixedString<'ses'>): Promise<string | null> {
  const result = await listSessionTodos(sessionId);
  if (result.error || result.data.length === 0) return null;

  const lines = result.data.map((todo) => `- [${todo.status}] (${todo.priority}) ${todo.content}`);

  return `<todos>\n${lines.join('\n')}\n</todos>`;
}
