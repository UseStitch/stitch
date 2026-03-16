import { PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react';

import { ServerStatus } from '@/components/layout/server-status';
import { useSidebar } from '@/components/ui/sidebar';
import { useDialogContext } from '@/context/dialog-context';

const MAC_TRAFFIC_LIGHTS_SPACE_PX = 76;

export function MacTitleBar() {
  const { open, toggleSidebar } = useSidebar();
  const { setSettingsOpen } = useDialogContext();

  return (
    <div
      className="h-9 bg-sidebar flex items-center justify-between select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div style={{ width: MAC_TRAFFIC_LIGHTS_SPACE_PX }} />
        <button
          onClick={toggleSidebar}
          className="w-9 h-full flex items-center justify-center hover:bg-muted transition-colors"
        >
          {open ? (
            <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
          ) : (
            <PanelLeftOpen className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>
      <div
        className="flex h-full items-center pr-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ServerStatus />
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-9 h-full flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="Open settings"
        >
          <Settings2 className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
