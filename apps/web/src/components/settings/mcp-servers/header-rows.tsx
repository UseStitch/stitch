import { Trash2Icon } from 'lucide-react';

import type { HeaderEntry } from './shared';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { SettingsIconButtonTooltip } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function HeaderRows({ rows, onChange }: { rows: HeaderEntry[]; onChange: (rows: HeaderEntry[]) => void }) {
  const update = (index: number, field: 'key' | 'value', val: string) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: val } : row)));
  };

  const remove = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...rows, { id: crypto.randomUUID(), key: '', value: '' }]);
  };

  return (
    <div className="space-y-space-m">
      {rows.map((row, i) => (
        <Stack key={row.id} direction="row" align="center" gap="m">
          <Input
            placeholder="Header name"
            value={row.key}
            onChange={(e) => update(i, 'key', e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Value"
            value={row.value}
            onChange={(e) => update(i, 'value', e.target.value)}
            className="flex-1"
          />
          <SettingsIconButtonTooltip label="Remove header">
            <Button variant="ghost" size="icon-sm" onClick={() => remove(i)} aria-label="Remove header">
              <Icon as={Trash2Icon} size="s" />
            </Button>
          </SettingsIconButtonTooltip>
        </Stack>
      ))}
      <Button variant="outline" size="sm" onClick={add} type="button">
        Add header
      </Button>
    </div>
  );
}
