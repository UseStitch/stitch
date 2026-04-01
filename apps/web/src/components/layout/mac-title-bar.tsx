import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { ServerStatus } from '@/components/layout/server-status';
import { useSidebar } from '@/components/ui/sidebar';
import { useFullScreen } from '@/hooks/ui/use-fullscreen';
import { cn } from '@/lib/utils';

export function MacTitleBar() {
  const { open, toggleSidebar } = useSidebar();
  const isFullScreen = useFullScreen();

  return (
    <div
      className="flex h-9 items-center justify-between bg-sidebar select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className={cn('flex h-full items-center', !isFullScreen && 'pl-6')}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
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
