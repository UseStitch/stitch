import type { SessionTodo } from '@stitch/shared/todos/types';

import { StatusDot, type statusDotVariants } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

type TodoDockProps = { todos: SessionTodo[] };

const statusStyles = {
  in_progress: { dotColor: 'primary', content: '' },
  completed: { dotColor: 'success', content: 'text-muted-foreground line-through' },
  cancelled: { dotColor: 'muted', content: 'text-muted-foreground' },
  pending: { dotColor: 'warning', content: '' },
} satisfies Record<
  SessionTodo['status'],
  { dotColor: VariantProps<typeof statusDotVariants>['color']; content: string }
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
            <div className={cn('text-sm leading-5', statusStyles[todo.status].content)}>{todo.content}</div>
            <div className="mt-space-xs flex items-center gap-space-m text-xs text-muted-foreground">
              <span className="capitalize">{statusLabel(todo.status)}</span>
              <span aria-hidden="true">/</span>
              <span className="capitalize">{todo.priority}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
