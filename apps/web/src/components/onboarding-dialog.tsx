import { ArrowLeftIcon, CheckCircle2Icon, SparklesIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PROVIDER_META } from '@openwork/shared/providers/catalog';
import { PROVIDER_IDS, type AuthMethodDef, type FieldDef, type ProviderId } from '@openwork/shared/providers/types';

import { ProviderLogo } from '@/components/settings/provider-logo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSaveProviderConfigMutation } from '@/lib/mutations/provider-config';
import {
  providerConfigQueryOptions,
  providersQueryOptions,
  type ProviderSummary,
} from '@/lib/queries/providers';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';

type OnboardingStep = 'welcome' | 'provider' | 'success';
type FieldValues = Record<string, string>;

const SUCCESS_CLOSE_DELAY_MS = 1200;

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
            {!field.required && <span className="text-muted-foreground text-xs ml-1">(optional)</span>}
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

function OnboardingProviderConfig({
  provider,
  onBack,
  onConnected,
}: {
  provider: ProviderSummary;
  onBack: () => void;
  onConnected: () => void;
}) {
  const meta = (PROVIDER_IDS as readonly string[]).includes(provider.id)
    ? PROVIDER_META[provider.id as ProviderId]
    : undefined;
  const enabledAuthMethods = meta?.authMethods.filter((method) => method.enabled) ?? [];
  const queryClient = useQueryClient();
  const { data: existingConfig, isPending } = useQuery({
    ...providerConfigQueryOptions(provider.id),
    enabled: provider.enabled,
  });

  const existingMethod = (existingConfig?.auth as { method?: string } | undefined)?.method;
  const defaultMethod =
    (existingMethod && enabledAuthMethods.some((method) => method.method === existingMethod)
      ? existingMethod
      : undefined) ?? enabledAuthMethods[0]?.method ?? '';

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
    errorMessage: 'Failed to save provider config',
    onSuccess: () => {
      setFieldsByMethod({});
      setExtraFields({});
      onConnected();
    },
  });

  if (provider.enabled && isPending) {
    return <div className="text-muted-foreground text-sm">Loading provider configuration...</div>;
  }

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
  const activeMethodDef = enabledAuthMethods.find((m) => m.method === activeTab) as
    | AuthMethodDef
    | undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-6">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to providers">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div className="text-muted-foreground shrink-0">
          <ProviderLogo providerId={provider.id} providerName={meta.displayName} className="size-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">{meta.displayName}</h2>
          <p className="text-muted-foreground text-xs">{provider.model_count} models available</p>
        </div>
      </div>

      <div className="flex flex-col gap-5 flex-1">
        {meta.extraFields.length > 0 && (
          <FieldGroup
            fields={meta.extraFields}
            providerId={provider.id}
            values={extraFields}
            onChange={handleExtraFieldChange}
          />
        )}

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
            {saveMutation.isPending ? 'Saving...' : 'Save and continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OnboardingProviderStep({ onConnected }: { onConnected: () => void }) {
  const { data: providers } = useQuery(providersQueryOptions);
  const [selected, setSelected] = React.useState<ProviderSummary | null>(null);

  const selectableProviders = React.useMemo(() => {
    if (!providers) return [];
    return providers.filter((provider) => {
      if (!(PROVIDER_IDS as readonly string[]).includes(provider.id)) return false;
      const meta = PROVIDER_META[provider.id as ProviderId];
      return meta.authMethods.some((method) => method.enabled);
    });
  }, [providers]);

  if (!providers) {
    return <div className="text-muted-foreground text-sm">Loading providers...</div>;
  }

  if (selected) {
    return (
      <OnboardingProviderConfig
        provider={selected}
        onBack={() => setSelected(null)}
        onConnected={onConnected}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Setup Provider</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Connect one provider to unlock models and start chatting.
        </p>
      </div>

      <div className="flex flex-col border border-border/60 rounded-xl overflow-hidden">
        {selectableProviders.map((provider) => {
          const meta = PROVIDER_META[provider.id as ProviderId];
          return (
            <div
              key={provider.id}
              className="flex items-center justify-between py-3 px-4 border-b border-border/50 last:border-0"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-muted-foreground shrink-0">
                  <ProviderLogo providerId={provider.id} providerName={meta.displayName} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{meta.displayName}</p>
                  {meta.description && (
                    <p className="text-muted-foreground text-xs truncate">{meta.description}</p>
                  )}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelected(provider)}>
                <PlusIcon className="size-3.5 mr-1" />
                Connect
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function OnboardingDialog() {
  const queryClient = useQueryClient();
  const { data: settings, isPending: isSettingsPending } = useQuery(settingsQueryOptions);
  const { data: providers, isPending: isProvidersPending } = useQuery(providersQueryOptions);

  const [step, setStep] = React.useState<OnboardingStep>('welcome');
  const [dismissed, setDismissed] = React.useState(false);
  const didAutofinishRef = React.useRef(false);

  const saveOnboardingStatus = useMutation(
    saveSettingMutationOptions('onboarding.status', queryClient, { silent: true }),
  );

  const onboardingStatus = settings?.['onboarding.status'];
  const hasEnabledProvider = (providers ?? []).some((provider) => provider.enabled);
  const isOnboarded = onboardingStatus === 'completed';

  React.useEffect(() => {
    if (isSettingsPending || isProvidersPending || !hasEnabledProvider || isOnboarded) {
      return;
    }
    if (didAutofinishRef.current || saveOnboardingStatus.isPending) {
      return;
    }

    didAutofinishRef.current = true;
    saveOnboardingStatus.mutate('completed');
  }, [
    hasEnabledProvider,
    isOnboarded,
    isProvidersPending,
    isSettingsPending,
    saveOnboardingStatus,
  ]);

  React.useEffect(() => {
    if (step !== 'success') return;

    const timeout = window.setTimeout(() => {
      setDismissed(true);
    }, SUCCESS_CLOSE_DELAY_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [step]);

  const isLoading = isSettingsPending || isProvidersPending;
  const open = !isLoading && !dismissed && !isOnboarded && !hasEnabledProvider;

  if (!open) {
    return null;
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogHeader className="sr-only">
        <DialogTitle>Openwork Onboarding</DialogTitle>
      </DialogHeader>
      <DialogContent className="max-w-3xl! h-140 p-0 gap-0 overflow-hidden flex flex-col" showCloseButton={false}>
        <div className="flex h-full flex-col p-8">
          {step === 'welcome' && (
            <div className="flex h-full flex-col items-center justify-center text-center gap-6">
              <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <SparklesIcon className="size-6" />
              </div>
              <div className="space-y-2 max-w-lg">
                <h2 className="text-2xl font-semibold tracking-tight">Welcome to Openwork</h2>
                <p className="text-muted-foreground text-sm">
                  Let&apos;s set up your first provider so you can start chatting in less than a minute.
                </p>
              </div>
              <Button size="lg" onClick={() => setStep('provider')}>
                Continue
              </Button>
            </div>
          )}

          {step === 'provider' && (
            <OnboardingProviderStep
              onConnected={() => {
                saveOnboardingStatus.mutate('completed', {
                  onSuccess: () => {
                    setStep('success');
                  },
                });
              }}
            />
          )}

          {step === 'success' && (
            <div className="flex h-full flex-col items-center justify-center text-center gap-4">
              <div className="size-14 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <CheckCircle2Icon className="size-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">You&apos;re all set</h2>
                <p className="text-muted-foreground text-sm">Provider connected. Launching your workspace...</p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
