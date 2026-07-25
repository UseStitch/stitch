import * as React from 'react';
import { z } from 'zod';

import { useForm } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import {
  PROVIDER_IDS,
  isLocalProviderId,
  type FieldDef,
  type LocalProviderId,
  type ProviderId,
} from '@stitch/shared/providers/types';
import { validateBaseURL } from '@stitch/shared/providers/validation';

import { ProviderLogo } from './provider-logo';

import { LocalModelsPanel } from '@/components/settings/providers/local-models-panel';
import {
  buildProviderConfigBody,
  hydrateProviderConfigState,
  resolveDefaultAuthMethod,
  type FieldValues,
} from '@/components/settings/providers/utils';
import { SettingSubPage } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { FieldError, fieldErrorMessage } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusDot } from '@/components/ui/status-dot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDeleteProviderConfigMutation, useSaveProviderConfigMutation } from '@/lib/mutations/provider-config';
import { localProviderHealthQueryOptions } from '@/lib/queries/local-models';
import { providerConfigQueryOptions, type ProviderSummary } from '@/lib/queries/providers';

type Props = {
  provider: ProviderSummary;
  onBack: () => void;
  saveLabel?: string;
  onSaved?: () => void;
  showDisconnect?: boolean;
};

type ProviderFormState = { fieldsByMethod: Record<string, FieldValues>; extraFields: FieldValues };

const EMPTY_PROVIDER_FORM: ProviderFormState = { fieldsByMethod: {}, extraFields: {} };

function createProviderConfigSchema(extraFields: FieldDef[], method: string, methodFields: FieldDef[]) {
  return z
    .object({
      fieldsByMethod: z.record(z.string(), z.record(z.string(), z.string())),
      extraFields: z.record(z.string(), z.string()),
    })
    .superRefine((value, context) => {
      for (const field of extraFields) {
        const fieldValue = value.extraFields[field.key];
        if (field.required && !fieldValue) {
          context.addIssue({ code: 'custom', message: `${field.label} is required`, path: ['extraFields', field.key] });
        } else if (field.format === 'url' && fieldValue) {
          const result = validateBaseURL(fieldValue);
          if (!result.valid) {
            context.addIssue({ code: 'custom', message: result.reason, path: ['extraFields', field.key] });
          }
        }
      }

      for (const field of methodFields) {
        if (field.required && !value.fieldsByMethod[method]?.[field.key]) {
          context.addIssue({
            code: 'custom',
            message: `${field.label} is required`,
            path: ['fieldsByMethod', method, field.key],
          });
        }
      }
    });
}

function LocalProviderStatusBadge({ provider }: { provider: LocalProviderId }) {
  const { data } = useQuery(localProviderHealthQueryOptions(provider));
  if (!data) return null;
  if (data.reachable) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-success">
        <StatusDot color="success" size="sm" />
        Connected
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-warning">
      <StatusDot color="warning" size="sm" />
      Server not reachable
    </span>
  );
}

function NoFieldsNote({ method }: { method: string }) {
  if (method === 'adc') {
    return (
      <p className="text-sm text-muted-foreground">
        Uses Application Default Credentials from your environment. No additional configuration needed.
      </p>
    );
  }

  if (method === 'credential-provider') {
    return (
      <p className="text-sm text-muted-foreground">
        Uses the AWS credential provider chain (environment variables, shared credentials file, IAM role, etc.). No
        additional configuration needed.
      </p>
    );
  }

  if (method === 'none') {
    return (
      <p className="text-sm text-muted-foreground">
        No authentication required. Ollama runs locally and does not need an API key.
      </p>
    );
  }

  return null;
}

export function ProviderConfig({ provider, onBack, saveLabel = 'Save', onSaved, showDisconnect = true }: Props) {
  const meta = (PROVIDER_IDS as readonly string[]).includes(provider.id)
    ? PROVIDER_META[provider.id as ProviderId]
    : undefined;
  const enabledAuthMethods = React.useMemo(() => meta?.authMethods.filter((method) => method.enabled) ?? [], [meta]);
  const queryClient = useQueryClient();
  const { data: existingConfig } = useQuery({ ...providerConfigQueryOptions(provider.id), enabled: provider.enabled });

  const existingMethod = (existingConfig?.auth as { method?: string } | undefined)?.method;
  const defaultMethod = resolveDefaultAuthMethod(existingMethod, enabledAuthMethods);

  const [activeTab, setActiveTab] = React.useState(defaultMethod);
  const hydrationRef = React.useRef<{ providerId: string; enabled: boolean; hydrated: boolean } | null>(null);
  const activeMethodFields = React.useMemo(
    () => enabledAuthMethods.find((method) => method.method === activeTab)?.fields ?? [],
    [activeTab, enabledAuthMethods],
  );
  const providerConfigSchema = React.useMemo(
    () => createProviderConfigSchema(meta?.extraFields ?? [], activeTab, activeMethodFields),
    [activeMethodFields, activeTab, meta?.extraFields],
  );

  const saveMutation = useSaveProviderConfigMutation({
    providerId: provider.id,
    queryClient,
    successMessage: `${meta?.displayName ?? 'Provider'} connected`,
    errorMessage: 'Failed to save',
    onSuccess: () => {
      form.reset();
      onSaved?.();
      onBack();
    },
  });

  const deleteMutation = useDeleteProviderConfigMutation({
    providerId: provider.id,
    queryClient,
    successMessage: `${meta?.displayName ?? 'Provider'} disconnected`,
    errorMessage: 'Failed to disconnect',
    onSuccess: () => {
      form.reset();
      onBack();
    },
  });

  const form = useForm({
    defaultValues: EMPTY_PROVIDER_FORM,
    validators: { onMount: providerConfigSchema, onChange: providerConfigSchema },
    onSubmit: ({ value }) => {
      if (!meta) return;
      const body = buildProviderConfigBody({
        activeTab,
        enabledAuthMethods,
        currentMethodFields: value.fieldsByMethod[activeTab] ?? {},
        extraFields: value.extraFields,
        extraFieldDefs: meta.extraFields,
      });
      saveMutation.mutate(body);
    },
  });

  React.useEffect(() => {
    if (!meta || enabledAuthMethods.length === 0) return;

    const providerChanged =
      hydrationRef.current?.providerId !== provider.id || hydrationRef.current.enabled !== provider.enabled;
    if (providerChanged) {
      setActiveTab(defaultMethod);
      form.reset(EMPTY_PROVIDER_FORM);
      hydrationRef.current = { providerId: provider.id, enabled: provider.enabled, hydrated: !provider.enabled };
    }

    if (hydrationRef.current?.hydrated || existingConfig === undefined) return;

    const hydrated = existingConfig
      ? hydrateProviderConfigState(existingConfig as Record<string, unknown>, enabledAuthMethods)
      : null;
    const activeMethod = hydrated?.activeMethod ?? defaultMethod;
    setActiveTab(activeMethod);
    form.reset({
      fieldsByMethod: hydrated?.activeMethod ? { [hydrated.activeMethod]: hydrated.authFields } : {},
      extraFields: hydrated?.extraFields ?? {},
    });
    hydrationRef.current = { providerId: provider.id, enabled: provider.enabled, hydrated: true };
  }, [defaultMethod, enabledAuthMethods, existingConfig, form, meta, provider.enabled, provider.id]);

  if (!meta || enabledAuthMethods.length === 0) return null;

  function handleTabChange(value: string | null) {
    if (value) setActiveTab(value);
  }

  const hasMultipleMethods = enabledAuthMethods.length > 1;
  const activeMethodDef = enabledAuthMethods.find((m) => m.method === activeTab);

  function renderFields(fields: FieldDef[], providerId: string, method?: string) {
    return (
      <div className="flex flex-col gap-3">
        {fields.map((fieldDef) => {
          const name = method
            ? (`fieldsByMethod.${method}.${fieldDef.key}` as const)
            : (`extraFields.${fieldDef.key}` as const);
          return (
            <form.Field key={fieldDef.key} name={name}>
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${providerId}-${fieldDef.key}`}>
                    {fieldDef.label}
                    {!fieldDef.required ? <span className="ml-1 text-xs text-muted-foreground">(optional)</span> : null}
                  </Label>
                  {fieldDef.type === 'select' ? (
                    <Select value={field.state.value ?? ''} onValueChange={(value) => field.handleChange(value || '')}>
                      <SelectTrigger
                        id={`${providerId}-${fieldDef.key}`}
                        className="w-full"
                        aria-invalid={!!fieldErrorMessage(field.state.meta)}>
                        <SelectValue placeholder={fieldDef.placeholder}>
                          {fieldDef.options.find((option) => option.value === field.state.value)?.label ??
                            field.state.value}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent className="max-h-80 max-w-none">
                        {fieldDef.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`${providerId}-${fieldDef.key}`}
                      type={fieldDef.secret ? 'password' : fieldDef.format === 'url' ? 'url' : 'text'}
                      placeholder={fieldDef.placeholder}
                      value={field.state.value ?? ''}
                      aria-invalid={!!fieldErrorMessage(field.state.meta)}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  )}
                  <FieldError meta={field.state.meta} />
                </div>
              )}
            </form.Field>
          );
        })}
      </div>
    );
  }

  function handleSubmit() {
    void form.handleSubmit();
  }

  return (
    <SettingSubPage
      title={meta.displayName}
      description={provider.capabilities.join(', ')}
      onBack={onBack}
      backLabel="Back to providers"
      actions={
        <div className="flex items-center gap-3">
          <ProviderLogo providerId={provider.id} providerName={meta.displayName} className="size-5" />
          {provider.enabled &&
            (isLocalProviderId(provider.id) ? (
              <LocalProviderStatusBadge provider={provider.id} />
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                <StatusDot color="success" size="sm" />
                Connected
              </span>
            ))}
        </div>
      }>
      {isLocalProviderId(provider.id) && provider.enabled ? (
        <div className="flex flex-1 flex-col gap-5">
          {meta.extraFields.length > 0 && renderFields(meta.extraFields, provider.id)}
          <ButtonGroup className="pt-1">
            <Button onClick={handleSubmit} disabled={saveMutation.isPending} size="sm">
              {saveMutation.isPending ? 'Saving...' : saveLabel}
            </Button>
            {showDisconnect && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            )}
          </ButtonGroup>
          <LocalModelsPanel provider={provider.id} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-5">
          {/* Extra top-level fields (region, project, location, etc.) */}
          {meta.extraFields.length > 0 && renderFields(meta.extraFields, provider.id)}

          {/* Auth method section */}
          {hasMultipleMethods ? (
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList variant="line">
                {enabledAuthMethods.map((m) => (
                  <TabsTrigger key={m.method} value={m.method}>
                    {m.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {enabledAuthMethods.map((m) => (
                <TabsContent key={m.method} value={m.method} className="mt-4">
                  {m.fields.length > 0 ? (
                    renderFields(m.fields, `${provider.id}-${m.method}`, m.method)
                  ) : (
                    <NoFieldsNote method={m.method} />
                  )}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            activeMethodDef &&
            (activeMethodDef.fields.length > 0 ? (
              renderFields(activeMethodDef.fields, provider.id, activeMethodDef.method)
            ) : (
              <NoFieldsNote method={activeMethodDef.method} />
            ))
          )}

          <ButtonGroup className="pt-1">
            <Button onClick={handleSubmit} disabled={saveMutation.isPending} size="sm">
              {saveMutation.isPending ? 'Saving...' : saveLabel}
            </Button>
            {showDisconnect && provider.enabled && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            )}
          </ButtonGroup>
        </div>
      )}
    </SettingSubPage>
  );
}
