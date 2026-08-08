import { CheckCircleIcon } from 'lucide-react';

import type { StoredPart } from '@stitch/shared/chat/messages';

import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';

type BackgroundTaskResultPart = Extract<StoredPart, { type: 'background-task-result' }>;

export function BackgroundTaskResultBubble({ parts }: { parts: BackgroundTaskResultPart[] }) {
  const count = parts.reduce((total, part) => total + part.tasks.length, 0);
  return (
    <div className="flex items-center justify-center gap-space-s py-space-xs">
      <Icon as={CheckCircleIcon} size="s" color="var(--muted-foreground)" />
      <Text as="span" variant="caption" tone="muted">
        {count === 1 ? 'Background task result received' : `${count} background task results received`}
      </Text>
    </div>
  );
}
