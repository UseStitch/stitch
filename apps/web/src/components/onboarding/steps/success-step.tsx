import { CheckCircle2Icon } from 'lucide-react';

import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';

export function SuccessStep() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-space-xl text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-success-subtle text-success">
        <Icon as={CheckCircle2Icon} size="l" />
      </div>
      <div className="space-y-space-xs">
        <h2 className="text-xl font-semibold">You&apos;re all set</h2>
        <Text variant="body" tone="muted">
          Setup complete. Launching your workspace...
        </Text>
      </div>
    </div>
  );
}
