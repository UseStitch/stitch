import * as React from 'react';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import { PROVIDER_IDS, isLocalProviderId, type LocalProviderId, type ProviderId } from '@stitch/shared/providers/types';
import { validateBaseURL } from '@stitch/shared/providers/validation';

import { ProviderLogo } from './provider-logo';

import { FieldGroup, NoFieldsNote } from '@/components/settings/providers/field-group';
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
  const [fieldsByMethod, setFieldsByMethod] = React.useState<Record<string, FieldValues>>({});
  const [extraFields, setExtraFields] = React.useState<FieldValues>({});
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!existingConfig || !meta) return;
    const hydrated = hydrateProviderConfigState(existingConfig as Record<string, unknown>, enabledAuthMethods);
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
      setFieldsByMethod({});
      setExtraFields({});
      onBack();
    },
  });

  if (!meta || enabledAuthMethods.length === 0) return null;

  const currentMethodFields = fieldsByMethod[activeTab] ?? {};

  function handleMethodFieldChange(key: string, value: string) {
    setFieldsByMethod((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab], [key]: value } }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function handleExtraFieldChange(key: string, value: string) {
    setExtraFields((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  }

  function handleSave() {
    if (!meta) return;

    const errors: Record<string, string> = {};

    for (const field of meta.extraFields) {
      const value = extraFields[field.key];
      if (field.required && !value) {
        errors[field.key] = `${field.label} is required`;
      } else if (field.format === 'url' && value) {
        const result = validateBaseURL(value);
        if (!result.valid) {
          errors[field.key] = result.reason;
        }
      }
    }

    const methodDef = enabledAuthMethods.find((m) => m.method === activeTab);
    if (methodDef) {
      for (const field of methodDef.fields) {
        if (field.required && !currentMethodFields[field.key]) {
          errors[field.key] = `${field.label} is required`;
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
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
          <LocalModelsPanel provider={provider.id} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-5">
          {/* Extra top-level fields (region, project, location, etc.) */}
          {meta.extraFields.length > 0 && (
            <FieldGroup
              fields={meta.extraFields}
              providerId={provider.id}
              values={extraFields}
              errors={fieldErrors}
              onChange={handleExtraFieldChange}
            />
          )}

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
                    <FieldGroup
                      fields={m.fields}
                      providerId={`${provider.id}-${m.method}`}
                      values={fieldsByMethod[m.method] ?? {}}
                      errors={fieldErrors}
                      onChange={(key, value) =>
                        setFieldsByMethod((prev) => ({ ...prev, [m.method]: { ...prev[m.method], [key]: value } }))
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
                errors={fieldErrors}
                onChange={handleMethodFieldChange}
              />
            ) : (
              <NoFieldsNote method={activeMethodDef.method} />
            ))
          )}

          <ButtonGroup className="pt-1">
            <Button onClick={handleSave} disabled={saveMutation.isPending} size="sm">
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
