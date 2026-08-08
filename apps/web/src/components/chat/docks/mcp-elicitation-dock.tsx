import { ExternalLinkIcon } from 'lucide-react';
import * as React from 'react';

import type {
  McpElicitationContent,
  McpElicitationPropertySchema,
  McpElicitationRequest,
} from '@stitch/shared/mcp/types';

import { Dock } from '@/components/chat/docks/dock';
import { Icon } from '@/components/primitives/icon.js';
import { Stack } from '@/components/primitives/stack.js';
import { Text } from '@/components/primitives/text.js';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

type McpElicitationDockProps = {
  request: McpElicitationRequest;
  isPending: boolean;
  onRespond: (action: 'accept' | 'decline' | 'cancel', content?: McpElicitationContent) => void;
};

type FormValue = string | number | boolean | string[] | undefined;

function initialValues(request: McpElicitationRequest): Record<string, FormValue> {
  const required = new Set(request.requestedSchema?.required ?? []);
  return Object.fromEntries(
    Object.entries(request.requestedSchema?.properties ?? {}).map(([name, schema]) => [
      name,
      schema.default ?? (schema.type === 'boolean' && required.has(name) ? false : undefined),
    ]),
  );
}

function optionsFor(schema: McpElicitationPropertySchema): Array<{ value: string; label: string }> {
  if (schema.type === 'array') {
    if (schema.items.anyOf) return schema.items.anyOf.map((option) => ({ value: option.const, label: option.title }));
    return (schema.items.enum ?? []).map((value) => ({ value, label: value }));
  }
  if (schema.type !== 'string') return [];
  if ('oneOf' in schema && schema.oneOf) {
    return schema.oneOf.map((option) => ({ value: option.const, label: option.title }));
  }
  return ('enum' in schema ? (schema.enum ?? []) : []).map((value) => ({ value, label: value }));
}

function isValueValid(schema: McpElicitationPropertySchema, value: FormValue, required: boolean): boolean {
  if (value === undefined) return !required;
  if (typeof value === 'string') {
    if (required && value.length === 0) return false;
    if ('minLength' in schema && schema.minLength !== undefined && value.length < schema.minLength) return false;
    if ('maxLength' in schema && schema.maxLength !== undefined && value.length > schema.maxLength) return false;
  }
  if (Array.isArray(value) && schema.type === 'array') {
    if (required && value.length === 0) return false;
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
  }
  return true;
}

function fieldLabel(name: string, schema: McpElicitationPropertySchema): string {
  return schema.title ?? name.replaceAll('_', ' ');
}

export function McpElicitationDock({ request, isPending, onRespond }: McpElicitationDockProps) {
  const [values, setValues] = React.useState<Record<string, FormValue>>(() => initialValues(request));
  const [activeRequest, setActiveRequest] = React.useState(request.id);

  if (activeRequest !== request.id) {
    setActiveRequest(request.id);
    setValues(initialValues(request));
  }

  if (request.mode === 'url' && request.url) {
    const destination = new URL(request.url);
    return (
      <Dock.Root>
        <Stack gap="m">
          <Text as="p" variant="body">
            {request.message}
          </Text>
          <div className="rounded-md border border-border bg-background px-space-m py-space-s">
            <Text as="div" variant="caption" tone="muted">
              External destination
            </Text>
            <div className="mt-space-2xs break-all">
              <Text as="div" variant="body">
                {destination.href}
              </Text>
            </div>
          </div>
          <Text as="p" variant="caption" tone="muted">
            Information entered there goes directly to {destination.host}, not through Stitch or the model.
          </Text>
        </Stack>
        <Stack direction="row" align="center" justify="between" gap="m">
          <Dock.Actions>
            <Button variant="destructive" size="sm" disabled={isPending} onClick={() => onRespond('cancel')}>
              Cancel
            </Button>
            <Button variant="secondary" size="sm" disabled={isPending} onClick={() => onRespond('decline')}>
              Decline
            </Button>
          </Dock.Actions>
          <Button
            size="sm"
            disabled={isPending}
            onClick={async () => {
              await window.api.shell.openExternal(destination.href);
              onRespond('accept');
            }}>
            <Icon as={ExternalLinkIcon} size="xs" />
            Open {destination.host}
          </Button>
        </Stack>
      </Dock.Root>
    );
  }

  const schema = request.requestedSchema;
  if (!schema) return null;
  const required = new Set(schema.required ?? []);
  const canSubmit = Object.entries(schema.properties).every(([name, property]) =>
    isValueValid(property, values[name], required.has(name)),
  );

  function setValue(name: string, value: FormValue) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = Object.fromEntries(
      Object.entries(values).filter(
        (entry): entry is [string, Exclude<FormValue, undefined>] => entry[1] !== undefined,
      ),
    );
    onRespond('accept', content);
  }

  return (
    <Stack as="form" gap="l" onSubmit={submit}>
      <Text as="p" variant="body">
        {request.message}
      </Text>
      {Object.entries(schema.properties).map(([name, property]) => {
        const label = fieldLabel(name, property);
        const description = property.description;
        const options = optionsFor(property);
        const value = values[name];

        return (
          <Stack key={name} gap="s">
            <label htmlFor={`mcp-elicitation-${name}`}>
              <Text as="span" variant="body">
                {label}
                {required.has(name) ? ' *' : ''}
              </Text>
              {description ? (
                <span className="ml-space-xs">
                  <Text as="span" variant="caption" tone="muted">
                    {description}
                  </Text>
                </span>
              ) : null}
            </label>

            {property.type === 'boolean' ? (
              <label className="flex items-center gap-space-s">
                <Checkbox checked={value === true} onCheckedChange={(checked) => setValue(name, checked === true)} />
                <Text as="span" variant="caption">
                  {value === true ? 'Yes' : 'No'}
                </Text>
              </label>
            ) : options.length > 0 ? (
              <div className="space-y-space-s">
                {options.map((option) => {
                  const selected = Array.isArray(value) ? value.includes(option.value) : value === option.value;
                  return (
                    <Dock.Selectable
                      key={option.value}
                      selected={selected}
                      onClick={() => {
                        if (property.type !== 'array') return setValue(name, option.value);
                        const current = Array.isArray(value) ? value : [];
                        if (selected)
                          return setValue(
                            name,
                            current.filter((item) => item !== option.value),
                          );
                        if (property.maxItems === undefined || current.length < property.maxItems) {
                          setValue(name, [...current, option.value]);
                        }
                      }}>
                      {option.label}
                    </Dock.Selectable>
                  );
                })}
              </div>
            ) : (
              <Dock.Input
                id={`mcp-elicitation-${name}`}
                type={
                  property.type === 'number' || property.type === 'integer'
                    ? 'number'
                    : 'format' in property && property.format === 'email'
                      ? 'email'
                      : 'format' in property && property.format === 'uri'
                        ? 'url'
                        : 'format' in property && property.format === 'date'
                          ? 'date'
                          : 'text'
                }
                value={typeof value === 'string' || typeof value === 'number' ? value : ''}
                required={required.has(name)}
                min={'minimum' in property ? property.minimum : undefined}
                max={'maximum' in property ? property.maximum : undefined}
                minLength={'minLength' in property ? property.minLength : undefined}
                maxLength={'maxLength' in property ? property.maxLength : undefined}
                step={property.type === 'integer' ? 1 : property.type === 'number' ? 'any' : undefined}
                onChange={(event) => {
                  if (property.type === 'number' || property.type === 'integer') {
                    setValue(name, event.target.value === '' ? undefined : Number(event.target.value));
                  } else {
                    setValue(name, event.target.value);
                  }
                }}
              />
            )}
          </Stack>
        );
      })}
      <Stack direction="row" align="center" justify="between" gap="m">
        <Dock.Actions>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => onRespond('cancel')}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={() => onRespond('decline')}>
            Decline
          </Button>
        </Dock.Actions>
        <Button type="submit" size="sm" disabled={isPending || !canSubmit}>
          Submit
        </Button>
      </Stack>
    </Stack>
  );
}
