import { Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { ServerStatus } from '@/components/layout/server-status';
import { Icon } from '@/components/primitives/icon';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';
import { useFullScreen } from '@/hooks/ui/use-fullscreen';
import { cn } from '@/lib/utils';

export function TitleBar() {
  const isMac = window.electron?.platform === 'darwin';
  const isFullScreen = useFullScreen();

  return (
    <TitleBarShell>
      <TitleBarSection className={cn(isMac && !isFullScreen && 'pl-space-2xl')}>
        <SidebarToggleButton />
      </TitleBarSection>
      <TitleBarSection className={cn(isMac && 'pr-space-m')}>
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
    <div className="flex h-full w-9 items-center justify-center">
      <Button variant="ghost" size="icon" onClick={toggleSidebar}>
        {open ? <Icon as={PanelLeftClose} size="m" tone="muted" /> : <Icon as={PanelLeftOpen} size="m" tone="muted" />}
      </Button>
    </div>
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
