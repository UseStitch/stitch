import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  providerConfigQueryOptions,
  providerKeys,
  type ProviderSummary,
} from '@/lib/queries/providers';
import { serverFetch } from '@/lib/api';
import {
  PROVIDER_META,
  PROVIDER_IDS,
  type AuthMethodDef,
  type FieldDef,
  type ProviderId,
} from '@openwork/shared';

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
          <Input
            id={`${providerId}-${field.key}`}
            type={field.secret ? 'password' : 'text'}
            placeholder={field.placeholder}
            value={values[field.key] ?? ''}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
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
  const queryClient = useQueryClient();
  const { data: existingConfig } = useQuery(providerConfigQueryOptions(provider.id));

  const defaultMethod =
    (existingConfig?.auth as { method?: string } | undefined)?.method ??
    meta?.authMethods[0]?.method ??
    '';

  const [activeTab, setActiveTab] = React.useState(defaultMethod);
  const [fieldsByMethod, setFieldsByMethod] = React.useState<Record<string, FieldValues>>({});
  const [extraFields, setExtraFields] = React.useState<FieldValues>({});

  React.useEffect(() => {
    if (!existingConfig || !meta) return;

    const method = (existingConfig.auth as { method?: string } | undefined)?.method;
    if (method) setActiveTab(method);

    const authFields: FieldValues = {};
    const auth = existingConfig.auth as Record<string, unknown> | undefined;
    if (auth) {
      for (const [k, v] of Object.entries(auth)) {
        if (k !== 'method' && typeof v === 'string') authFields[k] = v;
      }
    }
    if (method) {
      setFieldsByMethod((prev) => ({ ...prev, [method]: authFields }));
    }

    const extra: FieldValues = {};
    for (const [k, v] of Object.entries(existingConfig)) {
      if (k !== 'auth' && k !== 'providerId' && typeof v === 'string') extra[k] = v;
    }
    setExtraFields(extra);
  }, [existingConfig, meta]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await serverFetch(`/provider/${provider.id}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? 'Failed to save');
      }
    },
    onSuccess: () => {
      setFieldsByMethod({});
      setExtraFields({});
      void queryClient.invalidateQueries({ queryKey: providerKeys.all });
      toast.success(`${meta?.displayName ?? 'Provider'} connected`);
      onBack();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await serverFetch(`/provider/${provider.id}/config`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect');
    },
    onSuccess: () => {
      setFieldsByMethod({});
      setExtraFields({});
      void queryClient.invalidateQueries({ queryKey: providerKeys.all });
      toast.success(`${meta?.displayName ?? 'Provider'} disconnected`);
      onBack();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!meta) return null;

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
    const methodDef = meta.authMethods.find((m) => m.method === activeTab);
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

  const hasMultipleMethods = meta.authMethods.length > 1;
  const activeMethodDef = meta.authMethods.find((m) => m.method === activeTab) as
    | AuthMethodDef
    | undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to providers">
          <ArrowLeftIcon className="size-4" />
        </Button>
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
              {meta.authMethods.map((m) => (
                <TabsTrigger key={m.method} value={m.method}>
                  {m.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {meta.authMethods.map((m) => (
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
