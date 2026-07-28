import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';

type ReasoningBlockProps = { text: string; isStreaming?: boolean };

export function ReasoningBlock({ text, isStreaming }: ReasoningBlockProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="my-space-m overflow-hidden rounded-lg border border-border-subtle bg-surface-sunken">
      <Button
        variant="ghost"
        onClick={() => setOpen((o) => !o)}
        className="h-auto w-full justify-start gap-space-m rounded-none px-space-l py-space-m text-xs text-muted-foreground hover:bg-transparent hover:text-foreground">
        {open ? <Icon as={ChevronDownIcon} size="s" /> : <Icon as={ChevronRightIcon} size="s" />}
        <Text as="span" variant="label" tone="muted">
          {isStreaming ? 'Thinking...' : 'Reasoning'}
        </Text>
        {isStreaming && <StatusDot color="info" size="sm" pulse className="ml-auto" />}
      </Button>
      {open && (
        <div className="border-t border-border-subtle px-space-l py-space-m text-xs leading-relaxed text-muted-foreground italic">
          {text}
        </div>
      )}
    </div>
  );
}
