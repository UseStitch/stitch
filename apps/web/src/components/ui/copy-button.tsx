import { CheckIcon, CopyIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type CopyButtonProps = Omit<React.ComponentProps<typeof Button>, 'children' | 'onClick'> & {
  value: string;
  copyLabel?: string;
  copiedLabel?: string;
};

export function CopyButton({
  value,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  className,
  variant = 'outline',
  size = 'icon-xs',
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeoutId = setTimeout(() => setCopied(false), 1000);
    return () => clearTimeout(timeoutId);
  }, [copied]);

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
      className={cn('text-muted-foreground hover:text-foreground', className)}
      title={copied ? copiedLabel : copyLabel}
      aria-label={copied ? copiedLabel : copyLabel}
      {...props}
    >
      <span className="relative inline-flex size-3">
        <CopyIcon
          className={cn(
            'absolute inset-0 size-3 transition-all duration-200',
            copied ? 'scale-75 opacity-0' : 'scale-100 opacity-100',
          )}
        />
        <CheckIcon
          className={cn(
            'text-success absolute inset-0 size-3 transition-all duration-200',
            copied ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
          )}
        />
      </span>
    </Button>
  );
}
