import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import { Spinner } from '@/components/ui/spinner';

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Spinner />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
          description: '!text-popover-foreground/70',
          actionButton:
            '!bg-primary !text-primary-foreground hover:!bg-primary/80 !font-medium !rounded-md !h-7 !px-2.5 !text-xs !transition-colors focus-visible:!ring-2 focus-visible:!ring-ring',
          cancelButton:
            '!bg-secondary !text-secondary-foreground hover:!bg-secondary/80 !font-medium !rounded-md !h-7 !px-2.5 !text-xs !transition-colors focus-visible:!ring-2 focus-visible:!ring-ring',
          closeButton:
            '!border-border !bg-popover !text-popover-foreground hover:!bg-accent hover:!text-accent-foreground focus-visible:!ring-ring',
          error:
            '[&_[data-action]]:!bg-destructive/10 hover:[&_[data-action]]:!bg-destructive/20 dark:[&_[data-action]]:!bg-destructive/20 dark:hover:[&_[data-action]]:!bg-destructive/30 [&_[data-action]]:!text-destructive',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
