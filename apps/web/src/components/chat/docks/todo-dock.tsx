import type { SessionTodo } from '@stitch/shared/todos/types';

import { cn } from '@/lib/utils';

type TodoDockProps = {
  todos: SessionTodo[];
};

const statusStyles = {
  in_progress: {
    dot: 'bg-primary',
    content: '',
  },
  completed: {
    dot: 'bg-success',
    content: 'text-muted-foreground line-through',
  },
  cancelled: {
    dot: 'bg-muted-foreground/40',
    content: 'text-muted-foreground',
  },
  pending: {
    dot: 'bg-warning',
    content: '',
  },
} satisfies Record<SessionTodo['status'], { dot: string; content: string }>;

function statusLabel(status: SessionTodo['status']): string {
  return status.replaceAll('_', ' ');
}

export function TodoDock({ todos }: TodoDockProps) {
  return (
    <div className="space-y-2">
      {todos.map((todo) => (
        <div
          key={todo.id}
          className="flex items-start gap-3 rounded-xl border border-border/60 px-3 py-2"
        >
          <div className={cn('mt-1 size-2 rounded-full', statusStyles[todo.status].dot)} />
          <div className="min-w-0 flex-1">
            <div className={cn('text-sm leading-5', statusStyles[todo.status].content)}>
              {todo.content}
            </div>
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
