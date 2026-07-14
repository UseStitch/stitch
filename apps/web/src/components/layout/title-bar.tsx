import { Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { ServerStatus } from '@/components/layout/server-status';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { useFullScreen } from '@/hooks/ui/use-fullscreen';
import { cn } from '@/lib/utils';

export function TitleBar() {
  const isMac = window.electron?.platform === 'darwin';
  const isFullScreen = useFullScreen();

  return (
    <TitleBarShell>
      <TitleBarSection className={cn(isMac && !isFullScreen && 'pl-6')}>
        <SidebarToggleButton />
      </TitleBarSection>
      <TitleBarSection className={cn(isMac && 'pr-2')}>
        <ServerStatus />
        {!isMac && <WindowsControls />}
      </TitleBarSection>
    </TitleBarShell>
  );
}

type TitleBarShellProps = { children: ReactNode };

function TitleBarShell({ children }: TitleBarShellProps) {
  return (
    <div
      className="flex h-9 items-center justify-between bg-sidebar select-none"
      style={{ WebkitAppRegion: 'drag' } as CSSProperties}>
      {children}
    </div>
  );
}

type TitleBarSectionProps = { children: ReactNode; className?: string };

function TitleBarSection({ children, className }: TitleBarSectionProps) {
  return (
    <div className={cn('flex h-full items-center', className)} style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
      {children}
    </div>
  );
}

function SidebarToggleButton() {
  const { open, toggleSidebar } = useSidebar();

  return (
    <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-full w-9 rounded-none">
      {open ? (
        <PanelLeftClose className="h-4 w-4 text-muted-foreground" />
      ) : (
        <PanelLeftOpen className="h-4 w-4 text-muted-foreground" />
      )}
    </Button>
  );
}

function WindowsControls() {
  const [isMaximized, setIsMaximized] = useState(false);

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
    <>
      <Button variant="ghost" size="icon" onClick={handleMinimize} className="h-full w-12 rounded-none">
        <Minus className="h-4 w-4 text-muted-foreground" />
      </Button>
      <Button variant="ghost" size="icon" onClick={handleMaximize} className="h-full w-12 rounded-none">
        {isMaximized ? (
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Square className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClose}
        className="group h-full w-12 rounded-none hover:bg-destructive hover:text-destructive-foreground">
        <X className="h-4 w-4 text-muted-foreground group-hover:text-destructive-foreground" />
      </Button>
    </>
  );
}
