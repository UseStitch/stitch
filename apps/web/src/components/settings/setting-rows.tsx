import * as React from 'react';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { saveSettingMutationOptions } from '@/lib/queries/settings';

type SettingRowLayoutProps = {
  label: string;
  description: string;
  htmlFor?: string;
  borderBottom?: boolean;
  children: React.ReactNode;
};

export function SettingRowLayout({
  label,
  description,
  htmlFor,
  borderBottom = true,
  children,
}: SettingRowLayoutProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 py-3',
        borderBottom && 'border-b border-border/50',
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

type NumberSettingRowProps = {
  settingKey: string;
  label: string;
  description: string;
  currentValue: string | undefined;
  min: number;
  max: number;
  borderBottom?: boolean;
};

export function NumberSettingRow({
  settingKey,
  label,
  description,
  currentValue,
  min,
  max,
  borderBottom,
}: NumberSettingRowProps) {
  const queryClient = useQueryClient();
  const saveMutation = useMutation(
    saveSettingMutationOptions(settingKey, queryClient, { silent: true }),
  );

  return (
    <SettingRowLayout label={label} description={description} borderBottom={borderBottom}>
      <div className="w-32">
        <Input
          type="number"
          min={String(min)}
          max={String(max)}
          defaultValue={currentValue}
          onBlur={(e) => saveMutation.mutate(e.target.value)}
        />
      </div>
    </SettingRowLayout>
  );
}

type SwitchSettingRowProps = {
  settingKey: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  borderBottom?: boolean;
};

export function SwitchSettingRow({
  settingKey,
  label,
  description,
  checked,
  disabled,
  borderBottom,
}: SwitchSettingRowProps) {
  const queryClient = useQueryClient();
  const saveMutation = useMutation(
    saveSettingMutationOptions(settingKey, queryClient, { silent: true }),
  );

  return (
    <SettingRowLayout label={label} description={description} borderBottom={borderBottom}>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => saveMutation.mutate(value ? 'true' : 'false')}
      />
    </SettingRowLayout>
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
  borderBottom?: boolean;
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
  borderBottom,
}: SliderSettingRowProps) {
  const queryClient = useQueryClient();
  const [localValue, setLocalValue] = React.useState(currentValue);

  React.useEffect(() => {
    setLocalValue(currentValue);
  }, [currentValue]);

  const saveMutation = useMutation(
    saveSettingMutationOptions(settingKey, queryClient, { silent: true }),
  );

  const formatValue = (value: number) =>
    precision === 0 ? String(Math.round(value)) : value.toFixed(precision);

  return (
    <SettingRowLayout label={label} description={description} borderBottom={borderBottom}>
      <div className="w-52 shrink-0">
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
      </div>
    </SettingRowLayout>
  );
}
