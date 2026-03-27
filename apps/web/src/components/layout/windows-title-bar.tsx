import { Minus, Square, X, Copy, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ServerStatus } from '@/components/layout/server-status';
import { useSidebar } from '@/components/ui/sidebar';

export function WindowsTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const { open, toggleSidebar } = useSidebar();

  useEffect(() => {
    const checkMaximized = async () => {
      if (window.api?.window?.isMaximized) {
        const maximized = await window.api.window.isMaximized();
        setIsMaximized(maximized);
      }
    };
    void checkMaximized();
  }, []);

  const handleMinimize = () => {
    void window.api?.window?.minimize();
  };

  const handleMaximize = async () => {
    await window.api?.window?.maximize();
    const maximized = await window.api?.window?.isMaximized();
    setIsMaximized(maximized ?? false);
  };

  const handleClose = () => {
    void window.api?.window?.close();
  };

  return (
    <div
      className="flex h-9 items-center justify-between bg-sidebar select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className="flex h-full items-center"
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
        className="flex h-full items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ServerStatus />
        <button
          onClick={handleMinimize}
          className="flex h-full w-12 items-center justify-center transition-colors hover:bg-muted"
        >
          <Minus className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-full w-12 items-center justify-center transition-colors hover:bg-muted"
        >
          {isMaximized ? (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <Square className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="group flex h-full w-12 items-center justify-center transition-colors hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="h-4 w-4 text-muted-foreground group-hover:text-white" />
        </button>
      </div>
    </div>
  );
}
