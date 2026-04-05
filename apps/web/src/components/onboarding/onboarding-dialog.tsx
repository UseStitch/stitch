import { ArrowLeftIcon, CheckCircle2Icon, SparklesIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PROVIDER_META } from '@stitch/shared/providers/catalog';
import { PROVIDER_IDS, type ProviderId } from '@stitch/shared/providers/types';

import { FieldGroup, NoFieldsNote } from '@/components/provider-config/field-group';
import {
  buildProviderConfigBody,
  hydrateProviderConfigState,
  resolveDefaultAuthMethod,
  type FieldValues,
} from '@/components/provider-config/utils';
import { ProviderLogo } from '@/components/settings/provider-logo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { useSaveProviderConfigMutation } from '@/lib/mutations/provider-config';
import {
  providerConfigQueryOptions,
  providersQueryOptions,
  type ProviderSummary,
} from '@/lib/queries/providers';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';

type OnboardingStep = 'welcome' | 'profile' | 'provider' | 'success';

const SUCCESS_CLOSE_DELAY_MS = 1200;
const CURRENT_ONBOARDING_VERSION = '3';

function getDetectedTimezone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof resolved === 'string' && resolved.trim().length > 0 ? resolved.trim() : 'UTC';
}

function getTimezoneOptions(initialTimezone: string): string[] {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  const listed = intlWithSupportedValues.supportedValuesOf?.('timeZone') ?? [];
  const preferred = [initialTimezone].filter((value) => value.length > 0);

  if (listed.length === 0) {
    return preferred;
  }

  return Array.from(new Set([...preferred, ...listed]));
}

function OnboardingProfileStep({
  initialName,
  initialTimezone,
  isSaving,
  onContinue,
}: {
  initialName: string;
  initialTimezone: string;
  isSaving: boolean;
  onContinue: (name: string, timezone: string) => void;
}) {
  const detectedTimezone = React.useMemo(() => getDetectedTimezone(), []);
  const [name, setName] = React.useState(initialName);
  const [timezone, setTimezone] = React.useState(initialTimezone || detectedTimezone);
  const [touched, setTouched] = React.useState(false);
  const timezoneOptions = React.useMemo(
    () => getTimezoneOptions(initialTimezone || detectedTimezone),
    [detectedTimezone, initialTimezone],
  );

  const trimmed = name.trim();
  const trimmedTimezone = timezone.trim();
  const hasError = touched && trimmed.length === 0;
  const hasTimezoneError = touched && trimmedTimezone.length === 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (trimmed.length === 0) {
      return;
    }
    if (trimmedTimezone.length === 0) {
      return;
    }
    onContinue(trimmed, trimmedTimezone);
  }

  return (
    <form
      className="mx-auto flex h-full w-full max-w-md flex-col justify-center gap-6"
      onSubmit={handleSubmit}
    >
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Tell us your name</h2>
        <p className="text-sm text-muted-foreground">
          We&apos;ll use it to personalize responses and transcription speaker labels.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-name">Name</Label>
        <Input
          id="onboarding-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="Jane"
          maxLength={80}
          autoFocus
        />
        {hasError && <p className="text-xs text-destructive">Please enter your name.</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="onboarding-timezone">Timezone</Label>
        <Select value={timezone} onValueChange={(value) => setTimezone(value ?? '')}>
          <SelectTrigger id="onboarding-timezone" className="w-full">
            <SelectValue placeholder="Select your timezone" />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {timezoneOptions.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasTimezoneError && <p className="text-xs text-destructive">Please select a timezone.</p>}
      </div>

      <Button
        size="lg"
        type="submit"
        disabled={isSaving || trimmed.length === 0 || trimmedTimezone.length === 0}
      >
        {isSaving ? 'Saving...' : 'Continue'}
      </Button>
    </form>
  );
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
  const enabledAuthMethods = React.useMemo(
    () => meta?.authMethods.filter((method) => method.enabled) ?? [],
    [meta],
  );
  const queryClient = useQueryClient();
  const { data: existingConfig, isPending } = useQuery({
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
    errorMessage: 'Failed to save provider config',
    onSuccess: () => {
      setFieldsByMethod({});
      setExtraFields({});
      onConnected();
    },
  });

  if (provider.enabled && isPending) {
    return <div className="text-sm text-muted-foreground">Loading provider configuration...</div>;
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
      </div>

      <div className="flex flex-1 flex-col gap-5">
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
    return <div className="text-sm text-muted-foreground">Loading providers...</div>;
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
        <p className="mt-1 text-sm text-muted-foreground">
          Connect one provider to unlock models and start chatting.
        </p>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-border/60">
        {selectableProviders.map((provider) => {
          const meta = PROVIDER_META[provider.id as ProviderId];
          return (
            <div
              key={provider.id}
              className="flex items-center justify-between border-b border-border/50 px-4 py-3 last:border-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="shrink-0 text-muted-foreground">
                  <ProviderLogo providerId={provider.id} providerName={meta.displayName} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{meta.displayName}</p>
                  {meta.description && (
                    <p className="truncate text-xs text-muted-foreground">{meta.description}</p>
                  )}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelected(provider)}>
                <PlusIcon className="mr-1 size-3.5" />
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
  const saveOnboardingVersion = useMutation(
    saveSettingMutationOptions('onboarding.version', queryClient, { silent: true }),
  );
  const saveProfileName = useMutation(
    saveSettingMutationOptions('profile.name', queryClient, { silent: true }),
  );
  const saveProfileTimezone = useMutation(
    saveSettingMutationOptions('profile.timezone', queryClient, { silent: true }),
  );

  const onboardingStatus = settings?.['onboarding.status'];
  const onboardingVersion = settings?.['onboarding.version'] ?? '1';
  const profileName = settings?.['profile.name']?.trim() ?? '';
  const profileTimezone = settings?.['profile.timezone']?.trim() ?? '';
  const hasProfileName = profileName.length > 0;
  const hasProfileTimezone = profileTimezone.length > 0;
  const hasEnabledProvider = (providers ?? []).some((provider) => provider.enabled);
  const isOnboarded = onboardingStatus === 'completed';
  const isLatestOnboardingVersion = onboardingVersion === CURRENT_ONBOARDING_VERSION;
  const isOnboardingComplete =
    isOnboarded &&
    isLatestOnboardingVersion &&
    hasProfileName &&
    hasProfileTimezone &&
    hasEnabledProvider;

  const completeOnboarding = React.useCallback(async () => {
    await saveOnboardingStatus.mutateAsync('completed');
    await saveOnboardingVersion.mutateAsync(CURRENT_ONBOARDING_VERSION);
  }, [saveOnboardingStatus, saveOnboardingVersion]);

  React.useEffect(() => {
    if (
      isSettingsPending ||
      isProvidersPending ||
      !hasEnabledProvider ||
      !hasProfileName ||
      !hasProfileTimezone ||
      isOnboardingComplete
    ) {
      return;
    }
    if (
      didAutofinishRef.current ||
      saveOnboardingStatus.isPending ||
      saveOnboardingVersion.isPending
    ) {
      return;
    }

    didAutofinishRef.current = true;
    void completeOnboarding().catch(() => undefined);
  }, [
    completeOnboarding,
    hasProfileName,
    hasProfileTimezone,
    hasEnabledProvider,
    isOnboardingComplete,
    isProvidersPending,
    isSettingsPending,
    saveOnboardingStatus.isPending,
    saveOnboardingVersion.isPending,
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
  const open = !isLoading && !dismissed && !isOnboardingComplete;

  if (!open) {
    return null;
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogHeader className="sr-only">
        <DialogTitle>Stitch Onboarding</DialogTitle>
      </DialogHeader>
      <DialogContent
        className="flex h-140 max-w-3xl! flex-col gap-0 overflow-hidden p-0"
        showCloseButton={false}
      >
        <div className="flex h-full flex-col p-8">
          {step === 'welcome' && (
            <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <SparklesIcon className="size-6" />
              </div>
              <div className="max-w-lg space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight">Welcome to Stitch</h2>
                <p className="text-sm text-muted-foreground">
                  Let&apos;s personalize your profile and connect your first provider so you can
                  start chatting in less than a minute.
                </p>
              </div>
              <Button size="lg" onClick={() => setStep('profile')}>
                Continue
              </Button>
            </div>
          )}

          {step === 'profile' && (
            <OnboardingProfileStep
              initialName={profileName}
              initialTimezone={profileTimezone}
              isSaving={
                saveProfileName.isPending ||
                saveProfileTimezone.isPending ||
                saveOnboardingStatus.isPending ||
                saveOnboardingVersion.isPending
              }
              onContinue={(name, timezone) => {
                void Promise.all([
                  saveProfileName.mutateAsync(name),
                  saveProfileTimezone.mutateAsync(timezone),
                ])
                  .then(() => {
                    if (hasEnabledProvider) {
                      return completeOnboarding().then(() => {
                        setStep('success');
                      });
                    }
                    setStep('provider');
                    return undefined;
                  })
                  .catch(() => undefined);
              }}
            />
          )}

          {step === 'provider' && (
            <OnboardingProviderStep
              onConnected={() => {
                void completeOnboarding()
                  .then(() => {
                    setStep('success');
                  })
                  .catch(() => undefined);
              }}
            />
          )}

          {step === 'success' && (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                <CheckCircle2Icon className="size-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">You&apos;re all set</h2>
                <p className="text-sm text-muted-foreground">
                  Provider connected. Launching your workspace...
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
