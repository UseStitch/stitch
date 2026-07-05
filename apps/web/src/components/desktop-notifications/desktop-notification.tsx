import { XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type DesktopNotificationProps = { children: ReactNode; exiting?: boolean; onDismiss: () => void };

function DesktopNotificationRoot({ children, exiting, onDismiss }: DesktopNotificationProps) {
  return (
    <article
      className={cn(
        'desktop-notification-surface group relative box-border flex w-full min-w-0 gap-2 overflow-hidden rounded-xl border p-3 shadow-lg shadow-black/15 transition-all duration-200 ease-out',
        exiting ? 'translate-x-8 opacity-0' : 'translate-x-0 opacity-100',
      )}>
      {children}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-muted hover:text-foreground">
        <XIcon className="size-3.5" />
      </button>
    </article>
  );
}

function DesktopNotificationIcon({ children }: { children: ReactNode }) {
  return (
    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
      {children}
    </div>
  );
}

function DesktopNotificationContent({ children }: { children: ReactNode }) {
  return <div className="min-w-0 flex-1 overflow-hidden pr-5">{children}</div>;
}

function DesktopNotificationTitle({ children }: { children: ReactNode }) {
  return <h2 className="truncate text-sm font-medium text-foreground">{children}</h2>;
}

function DesktopNotificationDescription({ children }: { children: ReactNode }) {
  return <p className="mt-0.5 text-xs leading-4 wrap-break-word text-muted-foreground">{children}</p>;
}

function DesktopNotificationActions({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex min-w-0 items-center gap-2 overflow-hidden">{children}</div>;
}

function DesktopNotificationAction({
  children,
  onClick,
  variant = 'default',
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'default' | 'ghost';
}) {
  return (
    <Button type="button" size="sm" variant={variant} onClick={onClick} className="h-7 min-w-0 px-2 text-xs shadow-sm">
      {children}
    </Button>
  );
}

const DesktopNotification = Object.assign(DesktopNotificationRoot, {
  Icon: DesktopNotificationIcon,
  Content: DesktopNotificationContent,
  Title: DesktopNotificationTitle,
  Description: DesktopNotificationDescription,
  Actions: DesktopNotificationActions,
  Action: DesktopNotificationAction,
});

export { DesktopNotification };
