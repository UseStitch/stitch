import { CheckCircle2Icon } from 'lucide-react';

import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';

export function SuccessStep() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-space-xl text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-success-subtle">
        <Icon as={CheckCircle2Icon} size="l" tone="success" />
      </div>
      <div className="space-y-space-xs">
        <Text variant="heading-m">You&apos;re all set</Text>
        <Text variant="body" tone="muted">
          Setup complete. Launching your workspace...
        </Text>
      </div>
    </div>
  );
}
