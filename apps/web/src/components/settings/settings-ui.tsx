import { ArrowLeftIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageDescription, PageHeader, PageHeaderContent, PageIcon, PageTitle } from '@/components/ui/page';
import { Slider } from '@/components/ui/slider';
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
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 h-7 w-fit px-2">
            <ArrowLeftIcon className="size-3.5" />
            {backLabel}
          </Button>
          {actions}
        </div>
        <h2 className="text-base font-bold">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
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
      <PageHeader className="mb-6">
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
    <section className={cn('mt-8 first:mt-0 space-y-3', className)}>
      {title ? <h3 className="text-sm font-medium">{title}</h3> : null}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// SettingRows — container that draws borders between its children automatically
// ---------------------------------------------------------------------------

type SettingRowsProps = { className?: string; children: React.ReactNode };

export function SettingRows({ className, children }: SettingRowsProps) {
  return <div className={cn('*:border-b *:border-border/50 [&>*:last-child]:border-b-0', className)}>{children}</div>;
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
    <div className={cn('flex items-center justify-between gap-4 py-3', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
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

type SliderSettingRowProps = {
  settingKey: string;
  label: string;
  description: string;
  currentValue: number;
  min: number;
  max: number;
  step: number;
  precision?: number;
};

export function SliderSettingRow({
  settingKey,
  label,
  description,
  currentValue,
  min,
  max,
  step,
  precision = 2,
}: SliderSettingRowProps) {
  const queryClient = useQueryClient();
  const [localValue, setLocalValue] = React.useState(currentValue);

  React.useEffect(() => {
    setLocalValue(currentValue);
  }, [currentValue]);

  const saveMutation = useMutation(saveSettingMutationOptions(settingKey, queryClient, { silent: true }));

  const formatValue = (value: number) => (precision === 0 ? String(Math.round(value)) : value.toFixed(precision));

  return (
    <SettingRow label={label} description={description}>
      <SettingRowControl>
        <div className="flex items-center gap-3">
          <Slider
            value={[localValue]}
            min={min}
            max={max}
            step={step}
            onValueChange={(value) => {
              const rawValue = Array.isArray(value) ? value[0] : value;
              const nextValue = Math.max(min, Math.min(max, rawValue ?? min));
              setLocalValue(nextValue);
              saveMutation.mutate(formatValue(nextValue));
            }}
          />
          <span className="w-10 text-right text-xs font-medium text-muted-foreground tabular-nums">
            {formatValue(localValue)}
          </span>
        </div>
      </SettingRowControl>
    </SettingRow>
  );
}
