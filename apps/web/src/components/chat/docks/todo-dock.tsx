import type { SessionTodo } from '@stitch/shared/todos/types';

import { Text } from '@/components/primitives/text.js';
import { StatusDot, type statusDotVariants } from '@/components/ui/status-dot';
import type { VariantProps } from 'class-variance-authority';

type TodoDockProps = { todos: SessionTodo[] };

const statusStyles = {
  in_progress: { dotColor: 'primary', tone: 'default' },
  completed: { dotColor: 'success', tone: 'muted' },
  cancelled: { dotColor: 'muted', tone: 'muted' },
  pending: { dotColor: 'warning', tone: 'default' },
} satisfies Record<
  SessionTodo['status'],
  { dotColor: VariantProps<typeof statusDotVariants>['color']; tone: 'default' | 'muted' }
>;

function statusLabel(status: SessionTodo['status']): string {
  return status.replaceAll('_', ' ');
}

export function TodoDock({ todos }: TodoDockProps) {
  return (
    <div className="space-y-space-m">
      {todos.map((todo) => (
        <div
          key={todo.id}
          className="flex items-start gap-space-l rounded-xl border border-border-subtle px-space-l py-space-m">
          <StatusDot color={statusStyles[todo.status].dotColor} className="mt-space-xs" />
          <div className="min-w-0 flex-1">
            <Text as="div" variant="body" tone={statusStyles[todo.status].tone}>
              {todo.status === 'completed' ? <s>{todo.content}</s> : todo.content}
            </Text>
            <div className="mt-space-xs flex items-center gap-space-m">
              <Text as="span" variant="caption" tone="muted">
                <span className="capitalize">{statusLabel(todo.status)}</span>
                <span aria-hidden="true">/</span>
                <span className="capitalize">{todo.priority}</span>
              </Text>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
