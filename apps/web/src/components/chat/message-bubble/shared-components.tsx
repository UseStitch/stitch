import { FileIcon } from 'lucide-react';
import * as React from 'react';

import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { CopyButton } from '@/components/ui/copy-button';

export const MESSAGE_ACTION_BUTTON_CLASS = 'items-center gap-space-xs leading-none';

export function InterruptedLabel() {
  return (
    <div className="mt-space-xs">
      <Text as="p" variant="caption" tone="faint">
        Interrupted
      </Text>
    </div>
  );
}

export function FileBlock({ mediaType }: { mediaType: string }) {
  return (
    <div className="my-space-m inline-flex items-center gap-space-s rounded-lg border border-border-subtle bg-surface-sunken px-space-l py-space-s">
      <Icon as={FileIcon} size="xs" />
      <Text as="span" variant="caption" tone="muted">
        {mediaType}
      </Text>
    </div>
  );
}

export function AssistantBubbleWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="group flex justify-start">
      <div className="w-full space-y-space-l">{children}</div>
    </div>
  );
}

export function MessageCopyButton({ text }: { text: string }) {
  return (
    <CopyButton
      value={text}
      copyLabel="Copy"
      copiedLabel="Copied"
      showLabel
      variant="quiet"
      size="inline"
      className={MESSAGE_ACTION_BUTTON_CLASS}
      aria-label="Copy message"
      title={undefined}
    />
  );
}
