import { FileIcon } from 'lucide-react';
import * as React from 'react';

import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { CopyButton } from '@/components/ui/copy-button';

export const MESSAGE_ACTION_BUTTON_CLASS =
  'h-auto items-center gap-space-xs rounded-none p-space-none text-xs leading-none font-normal text-muted-foreground hover:bg-transparent hover:text-foreground';

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
    <div className="my-space-m inline-flex items-center gap-space-s rounded-lg border border-border-subtle bg-surface-sunken px-space-l py-space-s text-xs text-muted-foreground">
      <Icon as={FileIcon} size="xs" />
      <span>{mediaType}</span>
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
      variant="ghost"
      size="xs"
      className={MESSAGE_ACTION_BUTTON_CLASS}
      aria-label="Copy message"
      title={undefined}
    />
  );
}
