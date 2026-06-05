import * as React from 'react';

import { cn } from '@/lib/utils';

function Page({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page"
      className={cn('flex h-full flex-col overflow-y-auto', className)}
      {...props}
    />
  );
}

function PageContent({
  className,
  width = 'constrained',
  ...props
}: React.ComponentProps<'div'> & { width?: 'constrained' | 'full' }) {
  return (
    <div
      data-slot="page-content"
      className={cn(
        'mx-auto flex w-full flex-1 flex-col gap-6 px-6 py-8',
        width === 'constrained' ? 'max-w-6xl' : 'max-w-5xl',
        className,
      )}
      {...props}
    />
  );
}

function PageHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header"
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
      {...props}
    />
  );
}

function PageHeaderContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-header-content"
      className={cn('flex items-center gap-3', className)}
      {...props}
    />
  );
}

function PageIcon({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="page-icon"
      className={cn(
        'flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary',
        className,
      )}
      {...props}
    />
  );
}

function PageTitle({ className, ...props }: React.ComponentProps<'h1'>) {
  return (
    <h1 data-slot="page-title" className={cn('text-xl font-semibold', className)} {...props} />
  );
}

function PageDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="page-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Page, PageContent, PageHeader, PageHeaderContent, PageIcon, PageTitle, PageDescription };
