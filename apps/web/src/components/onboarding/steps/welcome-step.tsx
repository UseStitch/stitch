import { SparklesIcon } from 'lucide-react';

import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';

export function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-space-2xl text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
        <Icon as={SparklesIcon} size="l" />
      </div>
      <div className="max-w-lg space-y-space-m">
        <h2 className="text-2xl font-semibold tracking-tight">Welcome to Stitch</h2>
        <Text variant="body" tone="muted">
          Let&apos;s personalize your profile and connect your first provider so you can start chatting in less than a
          minute.
        </Text>
      </div>
      <Button size="lg" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}
