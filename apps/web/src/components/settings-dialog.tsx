import * as React from 'react';
import { MonitorIcon, KeyboardIcon, ServerIcon, SparklesIcon, PaletteIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useDialogContext } from '@/context/dialog-context';
import { GeneralSettings } from '@/components/settings/general';
import { ShortcutsSettings } from '@/components/settings/shortcuts';
import { ProvidersSettings } from '@/components/settings/providers';
import { ModelsSettings } from '@/components/settings/models';
import { AppearanceSettings } from '@/components/settings/appearance';

interface SettingsSection {
  label: string;
  items: SettingsNavItem[];
}

interface SettingsNavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const SECTIONS: SettingsSection[] = [
  {
    label: 'Desktop',
    items: [
      { id: 'general', label: 'General', icon: <MonitorIcon className="size-4" /> },
      { id: 'appearance', label: 'Appearance', icon: <PaletteIcon className="size-4" /> },
      { id: 'shortcuts', label: 'Shortcuts', icon: <KeyboardIcon className="size-4" /> },
    ],
  },
  {
    label: 'Server',
    items: [
      { id: 'providers', label: 'Providers', icon: <ServerIcon className="size-4" /> },
      { id: 'models', label: 'Models', icon: <SparklesIcon className="size-4" /> },
    ],
  },
];

export function SettingsDialog() {
  const { settingsOpen, setSettingsOpen } = useDialogContext();
  const [activeItem, setActiveItem] = React.useState('general');

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Settings</DialogTitle>
      </DialogHeader>
      <DialogContent
        className="max-w-3xl! h-140 p-0 gap-0 overflow-hidden flex flex-col"
        showCloseButton={false}
      >
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-52 bg-muted/40 border-r flex flex-col p-3 gap-5 shrink-0">
            {SECTIONS.map((section) => (
              <div key={section.label} className="flex flex-col gap-0.5">
                <span className="text-muted-foreground/70 text-[11px] font-semibold uppercase tracking-wider px-2 pb-1">
                  {section.label}
                </span>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveItem(item.id)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-left transition-colors',
                      activeItem === item.id
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
          <ScrollArea className="flex-1">
            <main className="p-8">
              <SettingsContent activeItem={activeItem} />
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
    case 'shortcuts':
      return <ShortcutsSettings />;
    case 'providers':
      return <ProvidersSettings />;
    case 'models':
      return <ModelsSettings />;
    default:
      return null;
  }
}
