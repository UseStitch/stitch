import type { ToolPermissionValue } from '@stitch/shared/permissions/types';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const PERMISSION_OPTION_LABELS: Record<ToolPermissionValue, string> = {
  allow: 'Allow',
  ask: 'Ask',
  deny: 'Deny',
};

type PermissionSelectProps = {
  value: ToolPermissionValue;
  onChange: (value: ToolPermissionValue) => void;
  includeDeny?: boolean;
  disabled?: boolean;
};

export function PermissionSelect({
  value,
  onChange,
  includeDeny = false,
  disabled = false,
}: PermissionSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as ToolPermissionValue)}
      disabled={disabled}
    >
      <SelectTrigger size="sm" className="w-20 shrink-0">
        <SelectValue>{PERMISSION_OPTION_LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-0">
        <SelectItem value="allow">{PERMISSION_OPTION_LABELS.allow}</SelectItem>
        <SelectItem value="ask">{PERMISSION_OPTION_LABELS.ask}</SelectItem>
        {includeDeny && <SelectItem value="deny">{PERMISSION_OPTION_LABELS.deny}</SelectItem>}
      </SelectContent>
    </Select>
  );
}
