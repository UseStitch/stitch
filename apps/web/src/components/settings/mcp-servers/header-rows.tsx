import { Trash2Icon } from 'lucide-react';

import type { HeaderEntry } from './shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function HeaderRows({
  rows,
  onChange,
}: {
  rows: HeaderEntry[];
  onChange: (rows: HeaderEntry[]) => void;
}) {
  const update = (index: number, field: 'key' | 'value', val: string) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: val } : row)));
  };

  const remove = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...rows, { key: '', value: '' }]);
  };

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={`${row.key}-${i}`} className="flex items-center gap-2">
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
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => remove(i)}
            aria-label="Remove header"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} type="button">
        Add header
      </Button>
    </div>
  );
}
