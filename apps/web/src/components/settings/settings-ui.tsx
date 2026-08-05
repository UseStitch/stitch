import { ArrowLeftIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageDescription, PageHeader, PageHeaderContent, PageIcon, PageTitle } from '@/components/ui/page';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { saveSettingMutationOptions } from '@/lib/queries/settings';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// SettingSubPage — child/detail view with back-button header
// ---------------------------------------------------------------------------

type SettingSubPageProps = {
  title: string;
  description?: string;
  onBack: () => void;
  backLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function SettingSubPage({
  title,
  description,
  onBack,
  backLabel = 'Back',
  actions,
  children,
}: SettingSubPageProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-space-2xl">
        <div className="mb-space-l flex items-center justify-between">
          <div className="-ml-space-m">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <Icon as={ArrowLeftIcon} size="s" />
              {backLabel}
            </Button>
          </div>
          {actions}
        </div>
        <Text variant="heading-s">{title}</Text>
        {description ? (
          <div className="mt-space-xs">
            <Text tone="muted">{description}</Text>
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingPage — top-level page wrapper with consistent header
// ---------------------------------------------------------------------------

type SettingPageProps = {
  title: string;
  description?: string;
  icon: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function SettingPage({ title, description, icon, actions, children }: SettingPageProps) {
  return (
    <div className="flex h-full flex-col">
      <PageHeader className="mb-space-2xl">
        <PageHeaderContent>
          <PageIcon>{icon}</PageIcon>
          <div>
            <PageTitle>{title}</PageTitle>
            {description ? <PageDescription>{description}</PageDescription> : null}
          </div>
        </PageHeaderContent>
        {actions}
      </PageHeader>
      {children}
    </div>
  );
}

type SettingsIconButtonTooltipProps = { label: string; children: React.ReactElement };

export function SettingsIconButtonTooltip({ label, children }: SettingsIconButtonTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// SettingSection — labelled section with automatic mt-8 spacing
// ---------------------------------------------------------------------------

type SettingSectionProps = { title?: string; description?: string; className?: string; children: React.ReactNode };

export function SettingSection({ title, description, className, children }: SettingSectionProps) {
  return (
    <section className={cn('mt-space-3xl first:mt-space-none space-y-space-l', className)}>
      {title ? (
        <Text as="h3" variant="label">
          {title}
        </Text>
      ) : null}
      {description ? (
        <Text variant="caption" tone="muted">
          {description}
        </Text>
      ) : null}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// SettingRows — container that draws borders between its children automatically
// ---------------------------------------------------------------------------

type SettingRowsProps = { className?: string; children: React.ReactNode };

export function SettingRows({ className, children }: SettingRowsProps) {
  return (
    <div className={cn('*:border-b *:border-border-subtle [&>*:last-child]:border-b-0', className)}>{children}</div>
  );
}

// ---------------------------------------------------------------------------
// SettingRow — single row layout: label+description on left, control on right
// ---------------------------------------------------------------------------

type SettingRowProps = {
  label: string;
  description?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
};

export function SettingRow({ label, description, htmlFor, className, children }: SettingRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-space-xl py-space-l', className)}>
      <div className="flex min-w-0 flex-col gap-space-2xs">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description ? (
          <Text variant="caption" tone="muted">
            {description}
          </Text>
        ) : null}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingRowControl — right-hand slot with a fixed standard width
// ---------------------------------------------------------------------------

type SettingRowControlProps = { className?: string; children: React.ReactNode };

export function SettingRowControl({ className, children }: SettingRowControlProps) {
  return <div className={cn('w-60 shrink-0', className)}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Pre-wired row components
// ---------------------------------------------------------------------------

type NumberSettingRowProps = {
  settingKey: string;
  label: string;
  description: string;
  currentValue: string | undefined;
  min: number;
  max: number;
};

export function NumberSettingRow({ settingKey, label, description, currentValue, min, max }: NumberSettingRowProps) {
  const queryClient = useQueryClient();
  const saveMutation = useMutation(saveSettingMutationOptions(settingKey, queryClient, { silent: true }));

  return (
    <SettingRow label={label} description={description}>
      <SettingRowControl>
        <Input
          type="number"
          min={String(min)}
          max={String(max)}
          defaultValue={currentValue}
          onBlur={(e) => saveMutation.mutate(e.target.value)}
        />
      </SettingRowControl>
    </SettingRow>
  );
}

type SwitchSettingRowProps = {
  settingKey: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
};

export function SwitchSettingRow({ settingKey, label, description, checked, disabled }: SwitchSettingRowProps) {
  const queryClient = useQueryClient();
  const saveMutation = useMutation(saveSettingMutationOptions(settingKey, queryClient, { silent: true }));

  return (
    <SettingRow label={label} description={description}>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => saveMutation.mutate(value ? 'true' : 'false')}
      />
    </SettingRow>
  );
}
