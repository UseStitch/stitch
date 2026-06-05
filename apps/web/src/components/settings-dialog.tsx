import {
  BrainIcon,
  GlobeIcon,
  KeyboardIcon,
  NetworkIcon,
  ServerIcon,
  PaletteIcon,
  WrenchIcon,
  MonitorIcon,
  CpuIcon,
  MicIcon,
  WandSparklesIcon,
} from 'lucide-react';
import * as React from 'react';

import { AppearanceSettings } from '@/components/settings/appearance';
import { BrowserSettings } from '@/components/settings/browser';
import { ConnectionSettings } from '@/components/settings/connection';
import { GeneralSettings } from '@/components/settings/general';
import { McpServersSettings } from '@/components/settings/mcp-servers';
import { MemorySettings } from '@/components/settings/memory';
import { ModelsSettings } from '@/components/settings/models';
import { ToolsSettings } from '@/components/settings/permissions';
import { ProvidersSettings } from '@/components/settings/providers';
import { RecordingsSettings } from '@/components/settings/recordings';
import { SettingLoading } from '@/components/settings/settings-ui';
import { ShortcutsSettings } from '@/components/settings/shortcuts';
import { SkillsSettings } from '@/components/settings/skills';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDialogContext } from '@/context/dialog-context';
import { cn } from '@/lib/utils';
import type { SettingsTab } from '@/routes/__root';

interface SettingsSection {
  label: string;
  items: SettingsNavItem[];
}

interface SettingsNavItem {
  id: SettingsTab;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: SettingsSection[] = [
  {
    label: 'Desktop',
    items: [
      { id: 'general', label: 'General', icon: <MonitorIcon className="size-4" /> },
      { id: 'connection', label: 'Connection', icon: <ServerIcon className="size-4" /> },
      { id: 'appearance', label: 'Appearance', icon: <PaletteIcon className="size-4" /> },
      { id: 'shortcuts', label: 'Shortcuts', icon: <KeyboardIcon className="size-4" /> },
    ],
  },
  {
    label: 'Apps',
    items: [
      { id: 'browser', label: 'Browser', icon: <GlobeIcon className="size-4" /> },
      { id: 'recordings', label: 'Recordings', icon: <MicIcon className="size-4" /> },
    ],
  },
  {
    label: 'AI',
    items: [
      { id: 'providers', label: 'Providers', icon: <ServerIcon className="size-4" /> },
      { id: 'models', label: 'Models', icon: <CpuIcon className="size-4" /> },
      { id: 'memory', label: 'Memory', icon: <BrainIcon className="size-4" /> },
      { id: 'skills', label: 'Skills', icon: <WandSparklesIcon className="size-4" /> },
      { id: 'tools', label: 'Tools', icon: <WrenchIcon className="size-4" /> },
      { id: 'mcp-servers', label: 'MCP Servers', icon: <NetworkIcon className="size-4" /> },
    ],
  },
];

export function SettingsDialog() {
  const { settingsTab, setSettingsTab } = useDialogContext();

  return (
    <Dialog
      open={!!settingsTab}
      onOpenChange={(open) => setSettingsTab(open ? 'general' : undefined)}
    >
      <DialogHeader className="sr-only">
        <DialogTitle>Settings</DialogTitle>
      </DialogHeader>
      <DialogContent
        className="flex h-160 max-w-4xl! flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <div className="flex flex-1 overflow-hidden">
          <aside className="flex w-52 shrink-0 flex-col gap-5 border-r bg-muted/40 p-3">
            {SECTIONS.map((section) => (
              <div key={section.label} className="flex flex-col gap-0.5">
                <span className="px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/70 uppercase">
                  {section.label}
                </span>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSettingsTab(item.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left transition-colors',
                      settingsTab === item.id
                        ? 'bg-accent text-accent-foreground font-medium shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </aside>
          <ScrollArea className="min-w-0 flex-1 overflow-hidden">
            <main className="p-8">
              <SettingsContent activeItem={settingsTab || 'general'} />
            </main>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsContent({ activeItem }: { activeItem: string }) {
  switch (activeItem) {
    case 'general':
      return <GeneralSettings />;
    case 'appearance':
      return <AppearanceSettings />;
    case 'connection':
      return <ConnectionSettings />;
    case 'browser':
      return (
        <React.Suspense fallback={<SettingLoading />}>
          <BrowserSettings />
        </React.Suspense>
      );
    case 'recordings':
      return <RecordingsSettings />;
    case 'shortcuts':
      return <ShortcutsSettings />;
    case 'providers':
      return <ProvidersSettings />;
    case 'models':
      return <ModelsSettings />;
    case 'memory':
      return <MemorySettings />;
    case 'skills':
      return <SkillsSettings />;
    case 'tools':
      return <ToolsSettings />;
    case 'mcp-servers':
      return <McpServersSettings />;
    default:
      return null;
  }
}
