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

import { InternalSidebar } from '@/components/navigation/internal-sidebar';

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
      {
        id: 'general',
        label: 'General',
        to: '/settings/general',
        icon: <MonitorIcon className="size-4" />,
      },
      {
        id: 'connection',
        label: 'Connection',
        to: '/settings/connection',
        icon: <ServerIcon className="size-4" />,
      },
      {
        id: 'appearance',
        label: 'Appearance',
        to: '/settings/appearance',
        icon: <PaletteIcon className="size-4" />,
      },
      {
        id: 'shortcuts',
        label: 'Shortcuts',
        to: '/settings/shortcuts',
        icon: <KeyboardIcon className="size-4" />,
      },
    ],
  },
  {
    label: 'Apps',
    items: [
      {
        id: 'browser',
        label: 'Browser',
        to: '/settings/browser',
        icon: <GlobeIcon className="size-4" />,
      },
      {
        id: 'recordings',
        label: 'Recordings',
        to: '/settings/recordings',
        icon: <MicIcon className="size-4" />,
      },
    ],
  },
  {
    label: 'AI',
    items: [
      {
        id: 'providers',
        label: 'Providers',
        to: '/settings/providers',
        icon: <ServerIcon className="size-4" />,
      },
      {
        id: 'models',
        label: 'Models',
        to: '/settings/models',
        icon: <CpuIcon className="size-4" />,
      },
      {
        id: 'memory',
        label: 'Memory',
        to: '/settings/memory',
        icon: <BrainIcon className="size-4" />,
      },
      {
        id: 'skills',
        label: 'Skills',
        to: '/settings/skills',
        icon: <WandSparklesIcon className="size-4" />,
      },
      {
        id: 'tools',
        label: 'Tools',
        to: '/settings/tools',
        icon: <WrenchIcon className="size-4" />,
      },
      {
        id: 'mcp-servers',
        label: 'MCP Servers',
        to: '/settings/mcp-servers',
        icon: <NetworkIcon className="size-4" />,
      },
    ],
  },
];

export function SettingsSidebarContent() {
  const currentPath = useRouterState({ select: (state) => state.location.pathname });

  return (
    <InternalSidebar.Content>
      {SECTIONS.map((section) => (
        <InternalSidebar.Section key={section.label} title={section.label}>
          {section.items.map((item) => {
            const active = currentPath === item.to;
            return (
              <InternalSidebar.SectionItem
                key={item.id}
                isActive={active}
                render={<Link to={item.to} preload="intent" />}
              >
                {item.icon}
                <span>{item.label}</span>
              </InternalSidebar.SectionItem>
            );
          })}
        </InternalSidebar.Section>
      ))}
    </InternalSidebar.Content>
  );
}
