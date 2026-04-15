import type { FieldDef } from '@stitch/shared/providers/types';

import type { FieldValues } from './utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function FieldGroup({
  fields,
  providerId,
  values,
  onChange,
}: {
  fields: FieldDef[];
  providerId: string;
  values: FieldValues;
  onChange: (key: string, value: string) => void;
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <Label htmlFor={`${providerId}-${field.key}`}>
            {field.label}
            {!field.required ? (
              <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
            ) : null}
          </Label>
          {field.type === 'select' ? (
            <Select
              value={values[field.key] ?? ''}
              onValueChange={(value) => onChange(field.key, value || '')}
            >
              <SelectTrigger id={`${providerId}-${field.key}`} className="w-full">
                <SelectValue placeholder={field.placeholder}>
                  {field.options.find((o) => o.value === values[field.key])?.label ?? values[field.key]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-80 max-w-none">
                {field.options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`${providerId}-${field.key}`}
              type={field.secret ? 'password' : 'text'}
              placeholder={field.placeholder}
              value={values[field.key] ?? ''}
              onChange={(event) => onChange(field.key, event.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function NoFieldsNote({ method }: { method: string }) {
  if (method === 'none') {
    return (
      <p className="text-sm text-muted-foreground">
        This provider runs on-device and requires no configuration. Click Save to enable it.
      </p>
    );
  }

  if (method === 'adc') {
    return (
      <p className="text-sm text-muted-foreground">
        Uses Application Default Credentials from your environment. No additional configuration
        needed.
      </p>
    );
  }

  if (method === 'credential-provider') {
    return (
      <p className="text-sm text-muted-foreground">
        Uses the AWS credential provider chain (environment variables, shared credentials file, IAM
        role, etc.). No additional configuration needed.
      </p>
    );
  }

  return null;
}
