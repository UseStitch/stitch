import {
  BrainIcon,
  CpuIcon,
  GlobeIcon,
  KeyboardIcon,
  MicIcon,
  MonitorIcon,
  NetworkIcon,
  PaletteIcon,
  ServerIcon,
  WandSparklesIcon,
  WrenchIcon,
} from 'lucide-react';
import * as React from 'react';

import { Link, useRouterState } from '@tanstack/react-router';

import { cn } from '@/lib/utils';

type SettingsNavItem = {
  id: string;
  label: string;
  to: string;
  icon: React.ReactNode;
};

type SettingsSection = {
  label: string;
  items: SettingsNavItem[];
};

const SECTIONS: SettingsSection[] = [
  {
    label: 'Desktop',
    items: [
      { id: 'general', label: 'General', to: '/settings/general', icon: <MonitorIcon className="size-4" /> },
      { id: 'connection', label: 'Connection', to: '/settings/connection', icon: <ServerIcon className="size-4" /> },
      { id: 'appearance', label: 'Appearance', to: '/settings/appearance', icon: <PaletteIcon className="size-4" /> },
      { id: 'shortcuts', label: 'Shortcuts', to: '/settings/shortcuts', icon: <KeyboardIcon className="size-4" /> },
    ],
  },
  {
    label: 'Apps',
    items: [
      { id: 'browser', label: 'Browser', to: '/settings/browser', icon: <GlobeIcon className="size-4" /> },
      { id: 'recordings', label: 'Recordings', to: '/settings/recordings', icon: <MicIcon className="size-4" /> },
    ],
  },
  {
    label: 'AI',
    items: [
      { id: 'providers', label: 'Providers', to: '/settings/providers', icon: <ServerIcon className="size-4" /> },
      { id: 'models', label: 'Models', to: '/settings/models', icon: <CpuIcon className="size-4" /> },
      { id: 'memory', label: 'Memory', to: '/settings/memory', icon: <BrainIcon className="size-4" /> },
      { id: 'skills', label: 'Skills', to: '/settings/skills', icon: <WandSparklesIcon className="size-4" /> },
      { id: 'tools', label: 'Tools', to: '/settings/tools', icon: <WrenchIcon className="size-4" /> },
      { id: 'mcp-servers', label: 'MCP Servers', to: '/settings/mcp-servers', icon: <NetworkIcon className="size-4" /> },
    ],
  },
];

export function SettingsNav() {
  const currentPath = useRouterState({ select: (state) => state.location.pathname });

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-5 border-r-0 bg-sidebar p-3">
      {SECTIONS.map((section) => (
        <div key={section.label} className="flex flex-col gap-0.5">
          <span className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
            {section.label}
          </span>
          {section.items.map((item) => {
            const active = currentPath === item.to;
            return (
              <Link
                key={item.id}
                to={item.to}
                preload="intent"
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                  active
                    ? 'bg-accent font-medium text-accent-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
