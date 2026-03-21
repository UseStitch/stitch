import { ArrowLeftIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import {
  PROVIDER_IDS,
  type FieldDef,
  type ProviderId,
} from '@stitch/shared/providers/types';

import { ProviderLogo } from './provider-logo';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useDeleteProviderConfigMutation,
  useSaveProviderConfigMutation,
} from '@/lib/mutations/provider-config';
import { providerConfigQueryOptions, type ProviderSummary } from '@/lib/queries/providers';

const AWS_BEDROCK_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)' },
  { value: 'us-east-2', label: 'US East (Ohio)' },
  { value: 'us-west-1', label: 'US West (N. California)' },
  { value: 'us-west-2', label: 'US West (Oregon)' },
  { value: 'eu-west-1', label: 'Europe (Ireland)' },
  { value: 'eu-west-2', label: 'Europe (London)' },
  { value: 'eu-west-3', label: 'Europe (Paris)' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
  { value: 'eu-central-2', label: 'Europe (Zurich)' },
  { value: 'eu-north-1', label: 'Europe (Stockholm)' },
  { value: 'ap-east-1', label: 'Asia Pacific (Hong Kong)' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
  { value: 'ap-south-2', label: 'Asia Pacific (Hyderabad)' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
  { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
  { value: 'ap-southeast-3', label: 'Asia Pacific (Jakarta)' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
  { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
  { value: 'ap-northeast-3', label: 'Asia Pacific (Osaka)' },
  { value: 'ca-central-1', label: 'Canada (Central)' },
  { value: 'sa-east-1', label: 'South America (São Paulo)' },
  { value: 'me-west-1', label: 'Middle East (UAE)' },
  { value: 'me-central-1', label: 'Middle East (UAE)' },
  { value: 'af-south-1', label: 'Africa (Cape Town)' },
];

type Props = {
  provider: ProviderSummary;
  onBack: () => void;
};

type FieldValues = Record<string, string>;

function FieldGroup({
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
  if (fields.length === 0) return null;
  const isBedrock = providerId === 'amazon-bedrock';
  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <Label htmlFor={`${providerId}-${field.key}`}>
            {field.label}
            {!field.required && (
              <span className="text-muted-foreground text-xs ml-1">(optional)</span>
            )}
          </Label>
          {isBedrock && field.key === 'region' ? (
            <Select
              value={values[field.key] ?? ''}
              onValueChange={(value) => onChange(field.key, value || '')}
            >
              <SelectTrigger id={`${providerId}-${field.key}`} className="w-full">
                <SelectValue placeholder={field.placeholder} />
              </SelectTrigger>
              <SelectContent className="max-w-none max-h-80">
                {AWS_BEDROCK_REGIONS.map((region) => (
                  <SelectItem key={region.value} value={region.value}>
                    {region.label} ({region.value})
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
              onChange={(e) => onChange(field.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function NoFieldsNote({ method }: { method: string }) {
  if (method === 'adc') {
    return (
      <p className="text-muted-foreground text-sm">
        Uses Application Default Credentials from your environment. No additional configuration
        needed.
      </p>
    );
  }
  if (method === 'credential-provider') {
    return (
      <p className="text-muted-foreground text-sm">
        Uses the AWS credential provider chain (environment variables, shared credentials file, IAM
        role, etc.). No additional configuration needed.
      </p>
    );
  }
  return null;
}

export function ProviderConfig({ provider, onBack }: Props) {
  const meta = (PROVIDER_IDS as readonly string[]).includes(provider.id)
    ? PROVIDER_META[provider.id as ProviderId]
    : undefined;
  const enabledAuthMethods = React.useMemo(
    () => meta?.authMethods.filter((method) => method.enabled) ?? [],
    [meta],
  );
  const queryClient = useQueryClient();
  const { data: existingConfig } = useQuery({
    ...providerConfigQueryOptions(provider.id),
    enabled: provider.enabled,
  });

  const existingMethod = (existingConfig?.auth as { method?: string } | undefined)?.method;
  const defaultMethod =
    (existingMethod && enabledAuthMethods.some((method) => method.method === existingMethod)
      ? existingMethod
      : undefined) ??
    enabledAuthMethods[0]?.method ??
    '';

  const [activeTab, setActiveTab] = React.useState(defaultMethod);
  const [fieldsByMethod, setFieldsByMethod] = React.useState<Record<string, FieldValues>>({});
  const [extraFields, setExtraFields] = React.useState<FieldValues>({});

  React.useEffect(() => {
    if (!existingConfig || !meta) return;

    const method = (existingConfig.auth as { method?: string } | undefined)?.method;
    if (method && enabledAuthMethods.some((authMethod) => authMethod.method === method)) {
      setActiveTab(method);
    } else if (enabledAuthMethods[0]?.method) {
      setActiveTab(enabledAuthMethods[0].method);
    }

    const authFields: FieldValues = {};
    const auth = existingConfig.auth as Record<string, unknown> | undefined;
    if (auth) {
      for (const [k, v] of Object.entries(auth)) {
        if (k !== 'method' && typeof v === 'string') authFields[k] = v;
      }
    }
    if (method && enabledAuthMethods.some((authMethod) => authMethod.method === method)) {
      setFieldsByMethod((prev) => ({ ...prev, [method]: authFields }));
    }

    const extra: FieldValues = {};
    for (const [k, v] of Object.entries(existingConfig)) {
      if (k !== 'auth' && k !== 'providerId' && typeof v === 'string') extra[k] = v;
    }
    setExtraFields(extra);
  }, [enabledAuthMethods, existingConfig, meta]);

  const saveMutation = useSaveProviderConfigMutation({
    providerId: provider.id,
    queryClient,
    successMessage: `${meta?.displayName ?? 'Provider'} connected`,
    errorMessage: 'Failed to save',
    onSuccess: () => {
      setFieldsByMethod({});
      setExtraFields({});
      onBack();
    },
  });

  const deleteMutation = useDeleteProviderConfigMutation({
    providerId: provider.id,
    queryClient,
    successMessage: `${meta?.displayName ?? 'Provider'} disconnected`,
    errorMessage: 'Failed to disconnect',
    onSuccess: () => {
      setFieldsByMethod({});
      setExtraFields({});
      onBack();
    },
  });

  if (!meta || enabledAuthMethods.length === 0) return null;

  const currentMethodFields = fieldsByMethod[activeTab] ?? {};

  function handleMethodFieldChange(key: string, value: string) {
    setFieldsByMethod((prev) => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [key]: value },
    }));
  }

  function handleExtraFieldChange(key: string, value: string) {
    setExtraFields((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    if (!meta) return;
    const auth: Record<string, unknown> = { method: activeTab };
    const methodDef = enabledAuthMethods.find((m) => m.method === activeTab);
    if (methodDef) {
      for (const field of methodDef.fields) {
        const val = currentMethodFields[field.key];
        if (val) auth[field.key] = val;
      }
    }

    const body: Record<string, unknown> = { auth };
    for (const field of meta.extraFields) {
      const val = extraFields[field.key];
      if (val) body[field.key] = val;
    }

    saveMutation.mutate(body);
  }

  function handleTabChange(value: string | null) {
    if (value) setActiveTab(value);
  }

  const hasMultipleMethods = enabledAuthMethods.length > 1;
  const activeMethodDef = enabledAuthMethods.find((m) => m.method === activeTab);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to providers">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="text-muted-foreground shrink-0">
          <ProviderLogo
            providerId={provider.id}
            providerName={meta.displayName}
            className="size-5"
          />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{meta.displayName}</h2>
          <p className="text-muted-foreground text-xs">{provider.model_count} models available</p>
        </div>
        {provider.enabled && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
            Connected
          </span>
        )}
      </div>

      <div className="flex flex-col gap-5 flex-1">
        {/* Extra top-level fields (region, project, location, etc.) */}
        {meta.extraFields.length > 0 && (
          <FieldGroup
            fields={meta.extraFields}
            providerId={provider.id}
            values={extraFields}
            onChange={handleExtraFieldChange}
          />
        )}

        {/* Auth method section */}
        {hasMultipleMethods ? (
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              {enabledAuthMethods.map((m) => (
                <TabsTrigger key={m.method} value={m.method}>
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {enabledAuthMethods.map((m) => (
              <TabsContent key={m.method} value={m.method} className="mt-4">
                {m.fields.length > 0 ? (
                  <FieldGroup
                    fields={m.fields}
                    providerId={`${provider.id}-${m.method}`}
                    values={fieldsByMethod[m.method] ?? {}}
                    onChange={(key, value) =>
                      setFieldsByMethod((prev) => ({
                        ...prev,
                        [m.method]: { ...prev[m.method], [key]: value },
                      }))
                    }
                  />
                ) : (
                  <NoFieldsNote method={m.method} />
                )}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          activeMethodDef &&
          (activeMethodDef.fields.length > 0 ? (
            <FieldGroup
              fields={activeMethodDef.fields}
              providerId={provider.id}
              values={currentMethodFields}
              onChange={handleMethodFieldChange}
            />
          ) : (
            <NoFieldsNote method={activeMethodDef.method} />
          ))
        )}

        <div className="flex items-center gap-2 pt-1">
          <Button onClick={handleSave} disabled={saveMutation.isPending} size="sm">
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
          {provider.enabled && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
