import { tool } from 'ai';
import { z } from 'zod';

import { TODO_PRIORITIES, TODO_STATUSES } from '@stitch/shared/todos/types';
import type { SessionTodo, TodoInput } from '@stitch/shared/todos/types';

import { isServiceError } from '@/lib/service-result.js';
import { listSessionTodos, replaceSessionTodos } from '@/todos/service.js';
import type { ToolContext } from '@/tools/runtime/wrappers.js';

export const DISPLAY_NAME = 'Todo';

const todoItemSchema = z.object({
  content: z.string().trim().min(1).describe('Specific task description.'),
  status: z.enum(TODO_STATUSES).describe('Current todo status.'),
  priority: z.enum(TODO_PRIORITIES).describe('Task priority.'),
});

const todoInputSchema = z.object({
  action: z.enum(['read', 'write']).describe('Read or replace the session todo list.'),
  todos: z
    .array(todoItemSchema)
    .optional()
    .describe('Full replacement todo list. Required for action="write".'),
});

function formatSummary(todos: TodoInput[]): string {
  if (todos.length === 0) return 'No todos.';

  return todos
    .map((todo, index) => `${index + 1}. [${todo.status}] (${todo.priority}) ${todo.content}`)
    .join('\n');
}

function toAgentTodos(todos: SessionTodo[]): TodoInput[] {
  return todos.map((todo) => ({
    content: todo.content,
    status: todo.status,
    priority: todo.priority,
  }));
}

export function createRegisteredTool(context: ToolContext) {
  return tool({
    description: `Read or update the current session todo list. Use this for multi-step work, visible progress tracking, and scratchpad planning. For write, provide the complete desired list, not a partial patch. Keep exactly one todo in_progress when actively working. Mark completed only after the work is done.`,
    inputSchema: todoInputSchema,
    execute: async (input) => {
      if (input.action === 'read') {
        const result = await listSessionTodos(context.sessionId);
        if (isServiceError(result)) return { output: result.error };

        return {
          output: formatSummary(result.data),
          todos: toAgentTodos(result.data),
        };
      }

      if (!input.todos) {
        return { output: 'Provide todos when action="write".' };
      }

      const result = await replaceSessionTodos({
        sessionId: context.sessionId,
        todos: input.todos,
      });
      if (isServiceError(result)) return { output: result.error };

      return {
        output: `Updated session todos:\n${formatSummary(result.data)}`,
        todos: toAgentTodos(result.data),
      };
    },
  });
}
