import { ArrowLeftIcon } from 'lucide-react';
import * as React from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import { PROVIDER_IDS, type ProviderId } from '@stitch/shared/providers/types';

import { ProviderLogo } from './provider-logo';

import { FieldGroup, NoFieldsNote } from '@/components/provider-config/field-group';
import {
  buildProviderConfigBody,
  hydrateProviderConfigState,
  resolveDefaultAuthMethod,
  type FieldValues,
} from '@/components/provider-config/utils';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useDeleteProviderConfigMutation,
  useSaveProviderConfigMutation,
} from '@/lib/mutations/provider-config';
import { providerConfigQueryOptions, type ProviderSummary } from '@/lib/queries/providers';

type Props = {
  provider: ProviderSummary;
  onBack: () => void;
};

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
  const defaultMethod = resolveDefaultAuthMethod(existingMethod, enabledAuthMethods);

  const [activeTab, setActiveTab] = React.useState(defaultMethod);
  const [fieldsByMethod, setFieldsByMethod] = React.useState<Record<string, FieldValues>>({});
  const [extraFields, setExtraFields] = React.useState<FieldValues>({});

  React.useEffect(() => {
    if (!existingConfig || !meta) return;
    const hydrated = hydrateProviderConfigState(
      existingConfig as Record<string, unknown>,
      enabledAuthMethods,
    );
    const activeMethod = hydrated.activeMethod;
    if (activeMethod) {
      setActiveTab(activeMethod);
      setFieldsByMethod((prev) => ({ ...prev, [activeMethod]: hydrated.authFields }));
    } else if (enabledAuthMethods[0]?.method) {
      setActiveTab(enabledAuthMethods[0].method);
    }
    setExtraFields(hydrated.extraFields);
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
    const body = buildProviderConfigBody({
      activeTab,
      enabledAuthMethods,
      currentMethodFields,
      extraFields,
      extraFieldDefs: meta.extraFields,
    });
    saveMutation.mutate(body);
  }

  function handleTabChange(value: string | null) {
    if (value) setActiveTab(value);
  }

  const hasMultipleMethods = enabledAuthMethods.length > 1;
  const activeMethodDef = enabledAuthMethods.find((m) => m.method === activeTab);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to providers">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="shrink-0 text-muted-foreground">
          <ProviderLogo
            providerId={provider.id}
            providerName={meta.displayName}
            className="size-5"
          />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{meta.displayName}</h2>
          <p className="text-xs text-muted-foreground">{provider.model_count} models available</p>
        </div>
        {provider.enabled && (
          <span className="ml-auto flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
            Connected
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-5">
        {/* Extra top-level fields (region, project, location, etc.) */}
        {meta.extraFields.length > 0 && (
          <FieldGroup
            fields={meta.extraFields}
            providerId={provider.id}
            values={extraFields}
            onChange={handleExtraFieldChange}
            enableBedrockRegionSelect
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
                    enableBedrockRegionSelect
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
              enableBedrockRegionSelect
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
