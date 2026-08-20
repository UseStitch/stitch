import { tool } from 'ai';
import { z } from 'zod';

import { TODO_PRIORITIES, TODO_STATUSES } from '@stitch/shared/todos/types';
import type { SessionTodo, TodoInput } from '@stitch/shared/todos/types';
import { toolError } from '@stitch/shared/tools/types';

import { listSessionTodos, replaceSessionTodos } from '@/todos/service.js';
import type { ToolDefinition } from '@/tools/runtime/pipeline.js';
import type { ToolContext } from '@/tools/runtime/runtime.js';

const todoItemSchema = z.object({
  content: z.string().trim().min(1).describe('Specific task description.'),
  status: z.enum(TODO_STATUSES).describe('Current todo status.'),
  priority: z.enum(TODO_PRIORITIES).describe('Task priority.'),
});

const todoInputSchema = z.object({
  action: z.enum(['read', 'write']).describe('Read or replace the session todo list.'),
  todos: z.array(todoItemSchema).optional().describe('Full replacement todo list. Required for action="write".'),
});

function formatSummary(todos: TodoInput[]): string {
  if (todos.length === 0) return 'No todos.';

  return todos.map((todo, index) => `${index + 1}. [${todo.status}] (${todo.priority}) ${todo.content}`).join('\n');
}

function toAgentTodos(todos: SessionTodo[]): TodoInput[] {
  return todos.map((todo) => ({ content: todo.content, status: todo.status, priority: todo.priority }));
}

export function createDefinition(context: ToolContext): ToolDefinition {
  return { name: 'todo', displayName: 'Todo', tool: createTodoTool(context) };
}

function createTodoTool(context: ToolContext) {
  return tool({
    description: `Read or update the current session todo list. Use this for multi-step work, visible progress tracking, and scratchpad planning. For write, provide the complete desired list, not a partial patch. Keep exactly one todo in_progress when actively working. Mark completed only after the work is done.`,
    inputSchema: todoInputSchema,
    execute: async (input) => {
      if (input.action === 'read') {
        const todos = await listSessionTodos(context.sessionId);
        return { output: formatSummary(todos), todos: toAgentTodos(todos) };
      }

      if (!input.todos) {
        return toolError('Provide todos when action="write".');
      }

      try {
        const updated = await replaceSessionTodos({ sessionId: context.sessionId, todos: input.todos });
        return { output: `Updated session todos:\n${formatSummary(updated)}`, todos: toAgentTodos(updated) };
      } catch (error) {
        const message = Error.isError(error) ? error.message : String(error);
        return toolError(message);
      }
    },
  });
}
