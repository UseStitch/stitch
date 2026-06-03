import { CheckIcon, CopyIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

export function RecordingCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timeoutId = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeoutId);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            toast.success('File path copied');
          },
          () => toast.error('Failed to copy file path'),
        );
      }}
      title="Copy path"
      aria-label="Copy path"
    >
      <span className="relative inline-flex size-4">
        <CopyIcon
          className={`absolute inset-0 size-4 transition-all duration-200 ${
            copied ? 'scale-75 opacity-0' : 'scale-100 opacity-100'
          }`}
        />
        <CheckIcon
          className={`absolute inset-0 size-4 text-success transition-all duration-200 ${
            copied ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
          }`}
        />
      </span>
    </Button>
  );
}
