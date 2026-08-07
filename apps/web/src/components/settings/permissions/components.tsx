import { cn } from 'cnfast';
import { ServerIcon, Settings2Icon, WrenchIcon } from 'lucide-react';
import * as React from 'react';

import { RemoteImageIcon } from '@/components/icons/remote-icon';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyMedia } from '@/components/ui/empty';
import { Switch } from '@/components/ui/switch';

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
        'grid items-center gap-space-l px-space-l py-space-m sm:px-space-xl',
        reserveMiddleSlot ? 'grid-cols-[minmax(0,1fr)_5rem_5rem_2.5rem]' : 'grid-cols-[minmax(0,1fr)_5rem_2.5rem]',
        isNested && 'pl-space-3xl sm:pl-space-3xl bg-surface-sunken',
      )}>
      <div className="flex min-w-0 items-center gap-space-m">
        {icon ??
          (iconPath && <RemoteImageIcon path={iconPath} label={`${name} icon`} className="size-4" fallback={null} />)}
        <div className="min-w-0">
          <Text variant="body-strong" truncate>
            {name}
          </Text>
        </div>
      </div>
      <Button size="sm" variant="quiet" width="full" align="start" onClick={onConfigure}>
        <Icon as={Settings2Icon} size="s" />
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
    <div className="grid grid-cols-[minmax(0,1fr)_5rem_2.5rem] items-center gap-space-l px-space-l py-space-m sm:px-space-xl">
      <div className="flex min-w-0 items-center gap-space-m">
        {icon ?? (
          <Text as="div" tone="muted">
            <Icon as={ServerIcon} size="m" />
          </Text>
        )}
        <div className="min-w-0">
          <Text variant="body-strong" truncate>
            {name}
          </Text>
          <Text variant="caption" tone="muted" truncate>
            {description}
          </Text>
        </div>
      </div>
      <Stack direction="row" justify={settingsAlign === 'end' ? 'end' : 'start'}>
        <Button size="sm" variant="quiet" onClick={onConfigure}>
          <Icon as={Settings2Icon} size="s" />
          Settings
        </Button>
      </Stack>
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
    <section className="overflow-hidden rounded-xl border border-border-subtle bg-card">
      <div className="flex items-start justify-between gap-space-l border-b border-border-subtle px-space-xl py-space-l">
        <div>
          <Text variant="body-strong">{title}</Text>
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        </div>
        <div className="rounded-md border border-border-subtle bg-surface-sunken px-space-m py-space-2xs">
          <Text variant="caption" tone="muted">
            {count}
          </Text>
        </div>
      </div>
      {children}
    </section>
  );
}

export function EmptyState() {
  return (
    <Empty surface="bordered" size="compact">
      <EmptyMedia>
        <Text as="div" tone="muted">
          <Icon as={WrenchIcon} size="m" />
        </Text>
      </EmptyMedia>
      <EmptyDescription>No tools match your current filters.</EmptyDescription>
    </Empty>
  );
}
