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
    <div className="space-y-2">
      {todos.map((todo) => (
        <div key={todo.id} className="flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2">
          <StatusDot color={statusStyles[todo.status].dotColor} className="mt-1" />
          <div className="min-w-0 flex-1">
            <div className={cn('text-sm leading-5', statusStyles[todo.status].content)}>{todo.content}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
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
