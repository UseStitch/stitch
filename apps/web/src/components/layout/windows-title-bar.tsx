import { Minus, Square, X, Copy, PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ServerStatus } from '@/components/layout/server-status';
import { useSidebar } from '@/components/ui/sidebar';
import { useDialogContext } from '@/context/dialog-context';

export function WindowsTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const { open, toggleSidebar } = useSidebar();
  const { setSettingsTab } = useDialogContext();

  useEffect(() => {
    const checkMaximized = async () => {
      if (window.api?.window?.isMaximized) {
        const maximized = await window.api.window.isMaximized();
        setIsMaximized(maximized);
      }
    };
    checkMaximized();
  }, []);

  const handleMinimize = () => {
    window.api?.window?.minimize();
  };

  const handleMaximize = async () => {
    await window.api?.window?.maximize();
    const maximized = await window.api?.window?.isMaximized();
    setIsMaximized(maximized ?? false);
  };

  const handleClose = () => {
    window.api?.window?.close();
  };

  return (
    <div
      className="h-9 bg-sidebar flex items-center justify-between select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
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
        className="flex h-full items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ServerStatus />
        <button
          onClick={() => setSettingsTab('general')}
          className="w-9 h-full flex items-center justify-center hover:bg-muted transition-colors"
          aria-label="Open settings"
        >
          <Settings2 className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          onClick={handleMinimize}
          className="w-12 h-full flex items-center justify-center hover:bg-muted transition-colors"
        >
          <Minus className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-full flex items-center justify-center hover:bg-muted transition-colors"
        >
          {isMaximized ? (
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <Square className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-full flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors group"
        >
          <X className="w-4 h-4 text-muted-foreground group-hover:text-white" />
        </button>
      </div>
    </div>
  );
}
