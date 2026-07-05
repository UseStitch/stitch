import {
  BarChart3Icon,
  BotIcon,
  BrainIcon,
  ListTodoIcon,
  MessageSquareIcon,
  MicIcon,
  PlugIcon,
  SettingsIcon,
} from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { Link, useRouterState } from '@tanstack/react-router';

import type { AppId } from '@stitch/shared/apps/types';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFullScreen } from '@/hooks/ui/use-fullscreen';
import { appEnabledStatesQueryOptions } from '@/lib/queries/apps';
import { connectorInstancesQueryOptions } from '@/lib/queries/connectors';
import { cn } from '@/lib/utils';
import { hasUpdaterBadge, useUpdaterStore } from '@/stores/updater-store';

type NavItemData = { id: string; icon: React.ReactNode; label: string; to: string; matchPrefix: string; appId?: AppId };

const TOP_ITEMS: NavItemData[] = [
  { id: 'chat', icon: <MessageSquareIcon className="size-5" />, label: 'Chat', to: '/', matchPrefix: '/' },
  {
    id: 'automations',
    icon: <BotIcon className="size-5" />,
    label: 'Automations',
    to: '/automations',
    matchPrefix: '/automations',
  },
  {
    id: 'recordings',
    icon: <MicIcon className="size-5" />,
    label: 'Recordings',
    to: '/recordings',
    matchPrefix: '/recordings',
    appId: 'recordings',
  },
  {
    id: 'agenda',
    icon: <ListTodoIcon className="size-5" />,
    label: 'Agenda',
    to: '/agenda',
    matchPrefix: '/agenda',
    appId: 'agenda',
  },
];

const BOTTOM_ITEMS: NavItemData[] = [
  {
    id: 'connectors',
    icon: <PlugIcon className="size-5" />,
    label: 'Connectors',
    to: '/connectors',
    matchPrefix: '/connectors',
  },
  {
    id: 'memories',
    icon: <BrainIcon className="size-5" />,
    label: 'Memories',
    to: '/memories',
    matchPrefix: '/memories',
  },
  { id: 'usage', icon: <BarChart3Icon className="size-5" />, label: 'Usage', to: '/usage', matchPrefix: '/usage' },
];

function isActive(matchPrefix: string, currentPath: string): boolean {
  if (matchPrefix === '/') {
    return currentPath === '/' || currentPath.startsWith('/session');
  }
  return currentPath.startsWith(matchPrefix);
}

function NavLink({
  to,
  label,
  icon,
  active,
  badge,
  preload,
  ariaLabel,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: string;
  preload?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to={to}
            {...(preload ? { preload: 'intent' as const } : {})}
            {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
            className={cn(
              'relative flex size-10 items-center justify-center rounded-lg transition-colors',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
            )}
          />
        }>
        {icon}
        {badge && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-warning" />}
      </TooltipTrigger>
      <TooltipContent side="right">{badge ?? label}</TooltipContent>
    </Tooltip>
  );
}

export function ActivityBar() {
  const currentPath = useRouterState({ select: (state) => state.location.pathname });
  const { data: appEnabledStates = [] } = useQuery(appEnabledStatesQueryOptions);
  const { data: connectorInstances = [] } = useQuery(connectorInstancesQueryOptions);
  const pendingConnectorUpdates = connectorInstances.filter((instance) => instance.upgrade?.available).length;
  const updaterStatus = useUpdaterStore((state) => state.updater.status);
  const showSettingsUpdateIndicator = hasUpdaterBadge(updaterStatus);
  const isMac = window.electron?.platform === 'darwin';
  const isFullScreen = useFullScreen();
  const showTrafficLightPadding = isMac && !isFullScreen;
  const disabledAppIds = new Set(appEnabledStates.filter((state) => !state.enabled).map((state) => state.appId));
  const topItems = TOP_ITEMS.filter((item) => !item.appId || !disabledAppIds.has(item.appId));

  return (
    <TooltipProvider>
      <div
        className={cn(
          'relative flex w-14 flex-col items-center bg-sidebar px-1.5 pb-3',
          showTrafficLightPadding ? 'pt-10' : 'border-r-2 border-border/50 pt-3',
        )}>
        {showTrafficLightPadding && (
          <div className="pointer-events-none absolute top-9 right-0 bottom-0 border-r-2 border-border/50" />
        )}
        <div className="flex w-full flex-col items-center gap-2">
          {topItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              label={item.label}
              icon={item.icon}
              active={isActive(item.matchPrefix, currentPath)}
            />
          ))}
        </div>
        <div className="mt-auto flex w-full flex-col items-center gap-2">
          {BOTTOM_ITEMS.map((item) => (
            <NavLink
              key={item.id}
              to={item.to}
              label={item.label}
              icon={item.icon}
              active={isActive(item.matchPrefix, currentPath)}
              badge={
                item.id === 'connectors' && pendingConnectorUpdates > 0
                  ? `${item.label} (updates available)`
                  : undefined
              }
            />
          ))}
          <NavLink
            to="/settings/general"
            label="Settings"
            icon={<SettingsIcon className="size-5" />}
            active={isActive('/settings', currentPath)}
            badge={showSettingsUpdateIndicator ? 'Settings (update available)' : undefined}
            preload
            ariaLabel="Open settings"
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
