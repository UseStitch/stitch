import { MessageSquareIcon, MicIcon } from 'lucide-react';

import { Link, useRouterState } from '@tanstack/react-router';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type ActivityItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  to: string;
  matchPrefix: string;
};

const ACTIVITY_ITEMS: ActivityItem[] = [
  {
    id: 'chat',
    icon: <MessageSquareIcon className="size-5" />,
    label: 'Chat',
    to: '/',
    matchPrefix: '/',
  },
  {
    id: 'recordings',
    icon: <MicIcon className="size-5" />,
    label: 'Recordings',
    to: '/recordings',
    matchPrefix: '/recordings',
  },
];

function isActive(matchPrefix: string, currentPath: string): boolean {
  if (matchPrefix === '/') {
    return currentPath === '/' || currentPath.startsWith('/session');
  }
  return currentPath.startsWith(matchPrefix);
}

export function ActivityBar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <div className="flex w-14 flex-col items-center gap-2 border-r border-border/50 bg-sidebar px-1.5 pt-3 pb-3">
      {ACTIVITY_ITEMS.map((item) => {
        const active = isActive(item.matchPrefix, currentPath);
        return (
          <Tooltip key={item.id}>
            <TooltipTrigger
              render={
                <Link
                  to={item.to}
                  className={cn(
                    'flex size-10 items-center justify-center rounded-lg transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                  )}
                />
              }
            >
              {item.icon}
            </TooltipTrigger>
            <TooltipContent side="right">{item.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
