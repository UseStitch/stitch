import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { ServerStatus } from '@/components/layout/server-status';
import { useSidebar } from '@/components/ui/sidebar';

const MAC_TRAFFIC_LIGHTS_SPACE_PX = 76;

export function MacTitleBar() {
  const { open, toggleSidebar } = useSidebar();

  return (
    <div
      className="flex h-9 items-center justify-between bg-sidebar select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className="flex h-full items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div style={{ width: MAC_TRAFFIC_LIGHTS_SPACE_PX }} />
        <button
          onClick={toggleSidebar}
          className="flex h-full w-9 items-center justify-center transition-colors hover:bg-muted"
        >
          {open ? (
            <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
          ) : (
            <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>
      <div
        className="flex h-full items-center pr-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ServerStatus />
      </div>
    </div>
  );
}
