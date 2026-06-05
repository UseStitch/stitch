import { ServerIcon, Settings2Icon, WrenchIcon } from 'lucide-react';
import * as React from 'react';

import { RemoteImageIcon } from '@/components/icons/remote-icon';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type ToolRowProps = {
  name: string;
  icon?: React.ReactNode;
  subtitle?: string;
  iconPath?: string;
  technicalName?: string;
  enabled: boolean;
  onConfigure: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  isMutating: boolean;
  reserveMiddleSlot?: boolean;
  isNested?: boolean;
};

type ToolsetRowProps = {
  name: string;
  description: string;
  icon?: React.ReactNode;
  enabled: boolean;
  onConfigure: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  isMutating: boolean;
  settingsAlign?: 'start' | 'end';
};

export function ToolRow({
  name,
  icon,
  iconPath,
  enabled,
  onConfigure,
  onToggleEnabled,
  isMutating,
  reserveMiddleSlot = false,
  isNested = false,
}: ToolRowProps) {
  return (
    <div
      className={cn(
        'grid items-center gap-3 px-3 py-2.5 sm:px-4',
        reserveMiddleSlot
          ? 'grid-cols-[minmax(0,1fr)_5rem_5rem_2.5rem]'
          : 'grid-cols-[minmax(0,1fr)_5rem_2.5rem]',
        isNested && 'pl-10 sm:pl-12 bg-muted/10',
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ??
          (iconPath && (
            <RemoteImageIcon
              path={iconPath}
              label={`${name} icon`}
              className="size-4"
              fallback={null}
            />
          ))}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onConfigure}
        className="h-7 w-full justify-start px-2 text-muted-foreground hover:text-foreground"
      >
        <Settings2Icon className="size-3.5" />
        Settings
      </Button>
      {reserveMiddleSlot && <div className="h-7 w-full" aria-hidden="true" />}
      <div className="flex w-10 justify-end">
        <Switch checked={enabled} onCheckedChange={onToggleEnabled} disabled={isMutating} />
      </div>
    </div>
  );
}

export function ToolsetRow({
  name,
  description,
  icon,
  enabled,
  onConfigure,
  onToggleEnabled,
  isMutating,
  settingsAlign = 'start',
}: ToolsetRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-3 px-3 py-2.5 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon ?? <ServerIcon className="size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onConfigure}
        className={cn(
          'h-7 w-full px-2 text-muted-foreground hover:text-foreground',
          settingsAlign === 'end' ? 'justify-end' : 'justify-start',
        )}
      >
        <Settings2Icon className="size-3.5" />
        Settings
      </Button>
      <div className="flex w-10 justify-end">
        <Switch checked={enabled} onCheckedChange={onToggleEnabled} disabled={isMutating} />
      </div>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  count,
  children,
}: {
  title: string;
  description: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-card/40">
      <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <p className="rounded-md border border-border/60 bg-muted/20 px-2 py-0.5 text-xs text-muted-foreground">
          {count}
        </p>
      </div>
      {children}
    </section>
  );
}

export function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border/70 px-4 py-8 text-center">
      <WrenchIcon className="mx-auto mb-2 size-4 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No tools match your current filters.</p>
    </div>
  );
}
