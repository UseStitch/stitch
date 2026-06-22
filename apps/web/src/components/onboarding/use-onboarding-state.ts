import * as React from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { providersQueryOptions } from '@/lib/queries/providers';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';

type OnboardingStep = 'welcome' | 'profile' | 'apps' | 'provider' | 'memory' | 'success';

const SUCCESS_CLOSE_DELAY_MS = 1200;
const CURRENT_ONBOARDING_VERSION = '4';

type OnboardingState = {
  step: OnboardingStep;
  dismissed: boolean;
  isLoading: boolean;
  isOnboardingComplete: boolean;
  profileName: string;
  profileTimezone: string;
  hasEnabledProvider: boolean;
  isSavingProfile: boolean;
  goToStep: (step: OnboardingStep) => void;
  saveProfileAndAdvance: (name: string, timezone: string) => void;
  completeOnboarding: () => void;
};

export function useOnboardingState(): OnboardingState {
  const queryClient = useQueryClient();
  const { data: settings, isPending: isSettingsPending } = useQuery(settingsQueryOptions);
  const { data: providers, isPending: isProvidersPending } = useQuery(providersQueryOptions);

  const [step, setStep] = React.useState<OnboardingStep>('welcome');
  const [dismissed, setDismissed] = React.useState(false);

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

  const profileName = settings?.['profile.name']?.trim() ?? '';
  const profileTimezone = settings?.['profile.timezone']?.trim() ?? '';
  const hasEnabledProvider = (providers ?? []).some((provider) => provider.enabled);

  const memoryEnabled = settings?.['memory.enabled'] === 'true';
  const hasMemoryModelConfigured =
    (settings?.['memory.embedding.providerId']?.trim().length ?? 0) > 0 &&
    (settings?.['memory.embedding.modelId']?.trim().length ?? 0) > 0;

  const isOnboardingComplete =
    settings?.['onboarding.status'] === 'completed' &&
    settings?.['onboarding.version'] === CURRENT_ONBOARDING_VERSION &&
    profileName.length > 0 &&
    profileTimezone.length > 0 &&
    hasEnabledProvider &&
    (!memoryEnabled || hasMemoryModelConfigured);

  React.useEffect(() => {
    if (step !== 'success') return;
    const timeout = window.setTimeout(() => setDismissed(true), SUCCESS_CLOSE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [step]);

  function saveProfileAndAdvance(name: string, timezone: string) {
    void Promise.all([saveProfileName.mutateAsync(name), saveProfileTimezone.mutateAsync(timezone)])
      .then(() => {
        setStep('apps');
        return undefined;
      })
      .catch(() => undefined);
  }

  function completeOnboarding() {
    void Promise.all([
      saveOnboardingStatus.mutateAsync('completed'),
      saveOnboardingVersion.mutateAsync(CURRENT_ONBOARDING_VERSION),
    ])
      .then(() => {
        setStep('success');
        return undefined;
      })
      .catch(() => undefined);
  }

  return {
    step,
    dismissed,
    isLoading: isSettingsPending || isProvidersPending,
    isOnboardingComplete,
    profileName,
    profileTimezone,
    hasEnabledProvider,
    isSavingProfile:
      saveProfileName.isPending ||
      saveProfileTimezone.isPending ||
      saveOnboardingStatus.isPending ||
      saveOnboardingVersion.isPending,
    goToStep: setStep,
    saveProfileAndAdvance,
    completeOnboarding,
  };
}
