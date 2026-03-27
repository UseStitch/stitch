import { FileIcon } from 'lucide-react';
import * as React from 'react';

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
    <div className="flex justify-start">
      <div className="w-full space-y-1.5">{children}</div>
    </div>
  );
}
