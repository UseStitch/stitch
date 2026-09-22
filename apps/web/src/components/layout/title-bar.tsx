import { cn } from 'cnfast';
import { Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ServerStatus } from '@/components/layout/server-status';
import { Icon } from '@/components/primitives/icon';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { useFullScreen } from '@/hooks/ui/use-fullscreen';

export function TitleBar() {
  const isMac = window.electron?.platform === 'darwin';
  const isFullScreen = useFullScreen();
  const { open, toggleSidebar } = useSidebar();
  const titleBarRef = useRef<HTMLDivElement>(null);
  const leftControlsRef = useRef<HTMLDivElement>(null);
  const rightControlsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    titleBarRef.current?.style.setProperty('-webkit-app-region', 'drag');
    leftControlsRef.current?.style.setProperty('-webkit-app-region', 'no-drag');
    rightControlsRef.current?.style.setProperty('-webkit-app-region', 'no-drag');
  }, []);

  return (
    <div ref={titleBarRef} className="flex h-9 items-center justify-between bg-sidebar select-none">
      <div ref={leftControlsRef} className={cn('flex h-full items-center', isMac && !isFullScreen && 'pl-space-2xl')}>
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
      <div ref={rightControlsRef} className={cn('flex h-full items-center', isMac && 'pr-space-m')}>
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
