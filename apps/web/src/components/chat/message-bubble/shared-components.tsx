import { FileIcon } from 'lucide-react';
import * as React from 'react';

import { CopyButton } from '@/components/ui/copy-button';

export const MESSAGE_ACTION_BUTTON_CLASS =
  'h-auto items-center gap-1 rounded-none p-0 text-xs leading-none font-normal text-muted-foreground hover:bg-transparent hover:text-foreground';

export function InterruptedLabel() {
  return <p className="mt-1 text-xs text-muted-foreground/60">Interrupted</p>;
}

export function FileBlock({ mediaType }: { mediaType: string }) {
  return (
    <div className="my-2 inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/25 px-3 py-1.5 text-xs text-muted-foreground">
      <FileIcon className="size-3 shrink-0" />
      <span>{mediaType}</span>
    </div>
  );
}

export function AssistantBubbleWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="group flex justify-start">
      <div className="w-full space-y-3">{children}</div>
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
