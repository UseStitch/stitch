import { BarChart3Icon, MessageSquareIcon, MicIcon, SettingsIcon } from 'lucide-react';

import { Link, useRouterState } from '@tanstack/react-router';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDialogContext } from '@/context/dialog-context';
import { cn } from '@/lib/utils';

type ActivityItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  to: string;
  matchPrefix: string;
};

type BottomActivityItem = {
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

const BOTTOM_ACTIVITY_ITEMS: BottomActivityItem[] = [
  {
    id: 'usage',
    icon: <BarChart3Icon className="size-5" />,
    label: 'Usage',
    to: '/usage',
    matchPrefix: '/usage',
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
  const { setSettingsTab } = useDialogContext();

  return (
    <div className="flex w-14 flex-col items-center border-r border-border/50 bg-sidebar px-1.5 pt-3 pb-3">
      <div className="flex w-full flex-col items-center gap-2">
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

      <div className="mt-auto flex w-full flex-col items-center gap-2">
        {BOTTOM_ACTIVITY_ITEMS.map((item) => {
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

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setSettingsTab('general')}
                className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                aria-label="Open settings"
              />
            }
          >
            <SettingsIcon className="size-5" />
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
