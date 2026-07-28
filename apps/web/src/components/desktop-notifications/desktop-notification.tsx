import { XIcon } from 'lucide-react';

import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

type DesktopNotificationProps = { children: ReactNode; exiting?: boolean; onDismiss: () => void };

function DesktopNotificationRoot({ children, exiting, onDismiss }: DesktopNotificationProps) {
  return (
    <article
      className={cn(
        'desktop-notification-surface group relative box-border flex w-full min-w-0 gap-space-m overflow-hidden rounded-xl border p-space-l shadow-lg shadow-border-subtle transition-all duration-base ease-standard',
        exiting ? 'translate-x-8 opacity-0' : 'translate-x-0 opacity-100',
      )}>
      {children}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="absolute top-1.5 right-1.5 rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground">
        <Icon as={XIcon} size="s" />
      </Button>
    </article>
  );
}

function DesktopNotificationIcon({ children }: { children: ReactNode }) {
  return (
    <div className="mt-space-2xs flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary ring-1 ring-primary-subtle">
      {children}
    </div>
  );
}

function DesktopNotificationContent({ children }: { children: ReactNode }) {
  return <div className="min-w-0 flex-1 overflow-hidden pr-space-xl">{children}</div>;
}

function DesktopNotificationTitle({ children }: { children: ReactNode }) {
  return <h2 className="truncate text-sm font-medium text-foreground">{children}</h2>;
}

function DesktopNotificationDescription({ children }: { children: ReactNode }) {
  return (
    <div className="mt-space-2xs wrap-break-word">
      <Text variant="caption" tone="muted">
        {children}
      </Text>
    </div>
  );
}

function DesktopNotificationActions({ children }: { children: ReactNode }) {
  return <div className="mt-space-m flex min-w-0 items-center gap-space-m overflow-hidden">{children}</div>;
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
    <Button
      type="button"
      size="sm"
      variant={variant}
      onClick={onClick}
      className="min-w-0 px-space-m text-xs shadow-sm">
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
