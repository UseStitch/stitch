import { cn } from 'cnfast';
import { Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';

import { ServerStatus } from '@/components/layout/server-status';
import { Icon } from '@/components/primitives/icon';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { useFullScreen } from '@/hooks/ui/use-fullscreen';

export function TitleBar() {
  const isMac = window.electron?.platform === 'darwin';
  const isFullScreen = useFullScreen();
  const { open, toggleSidebar } = useSidebar();

  return (
    <div
      className="flex h-9 items-center justify-between bg-sidebar select-none"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
      <div
        className={cn('flex h-full items-center', isMac && !isFullScreen && 'pl-space-2xl')}
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <div className="flex h-full w-9 items-center justify-center">
          <Button variant="ghost" size="icon" onClick={toggleSidebar}>
            {open ? (
              <Icon as={PanelLeftClose} size="m" tone="muted" />
            ) : (
              <Icon as={PanelLeftOpen} size="m" tone="muted" />
            )}
          </Button>
        </div>
      </div>
      <div
        className={cn('flex h-full items-center', isMac && 'pr-space-m')}
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
        <ServerStatus />
        {!isMac && <WindowsControls />}
      </div>
    </div>
  );
}

function WindowsControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    void window.api.window.isMaximized().then(setIsMaximized);
  }, []);

  const handleMinimize = () => {
    void window.api.window.minimize();
  };

  const handleMaximize = async () => {
    await window.api.window.maximize();
    const maximized = await window.api.window.isMaximized();
    setIsMaximized(maximized);
  };

  const handleClose = () => {
    void window.api.window.close();
  };

  return (
    <>
      <div className="flex h-full w-12 items-center justify-center">
        <Button variant="ghost" size="icon" onClick={handleMinimize}>
          <Icon as={Minus} size="m" tone="muted" />
        </Button>
      </div>
      <div className="flex h-full w-12 items-center justify-center">
        <Button variant="ghost" size="icon" onClick={handleMaximize}>
          {isMaximized ? <Icon as={Copy} size="s" tone="muted" /> : <Icon as={Square} size="s" tone="muted" />}
        </Button>
      </div>
      <div className="group flex h-full w-12 items-center justify-center hover:bg-destructive">
        <Button variant="quiet" size="icon" onClick={handleClose}>
          <Icon as={X} size="m" tone="muted" />
        </Button>
      </div>
    </>
  );
}
