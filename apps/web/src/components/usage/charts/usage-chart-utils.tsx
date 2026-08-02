import { BarChart3Icon } from 'lucide-react';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center text-center">
      <Stack gap="l" align="center">
        <Icon as={BarChart3Icon} size="l" tone="faint" />
        <div>
          <Text as="p" variant="body-strong" tone="faint">
            No data
          </Text>
          <Text as="p" variant="caption" tone="muted">
            {message}
          </Text>
        </div>
      </Stack>
    </div>
  );
}
