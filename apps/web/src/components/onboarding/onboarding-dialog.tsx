import { AppearanceStep } from './steps/appearance-step';
import { AppsStep } from './steps/apps-step';
import { MemoryStep } from './steps/memory-step';
import { ProfileStep } from './steps/profile-step';
import { ProviderStep } from './steps/provider-step';
import { SuccessStep } from './steps/success-step';
import { WelcomeStep } from './steps/welcome-step';
import { useOnboardingState } from './use-onboarding-state';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function OnboardingDialog() {
  const state = useOnboardingState();

  if (state.isLoading || state.dismissed || state.isOnboardingComplete) {
    return null;
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogHeader className="sr-only">
        <DialogTitle>Stitch Onboarding</DialogTitle>
      </DialogHeader>
      <DialogContent className="flex h-140 max-w-3xl! flex-col gap-0 overflow-hidden p-0" showCloseButton={false}>
        <div className="flex h-full flex-col p-8">
          {state.step === 'welcome' && <WelcomeStep onContinue={() => state.goToStep('profile')} />}

          {state.step === 'profile' && (
            <ProfileStep
              initialName={state.profileName}
              initialTimezone={state.profileTimezone}
              isSaving={state.isSavingProfile}
              onContinue={state.saveProfileAndAdvance}
            />
          )}

          {state.step === 'appearance' && <AppearanceStep onContinue={() => state.goToStep('apps')} />}

          {state.step === 'apps' && (
            <AppsStep onContinue={() => state.goToStep(state.hasEnabledProvider ? 'memory' : 'provider')} />
          )}

          {state.step === 'provider' && <ProviderStep onConnected={() => state.goToStep('memory')} />}

          {state.step === 'memory' && (
            <MemoryStep onComplete={state.completeOnboarding} onBackToProviders={() => state.goToStep('provider')} />
          )}

          {state.step === 'success' && <SuccessStep />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
