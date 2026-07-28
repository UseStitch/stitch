import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type DockVariant = 'default' | 'primary' | 'warning' | 'destructive';

export type DockItem = {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  variant?: DockVariant;
};

type DockItemProps = Omit<DockItem, 'id'> & { isLast: boolean };

type DockRootProps = React.ComponentProps<'div'>;

type DockIconProps = React.ComponentProps<'div'>;

type DockBodyProps = React.ComponentProps<'div'>;

type DockTitleProps = React.ComponentProps<'div'>;

type DockDescriptionProps = React.ComponentProps<'div'>;

type DockActionsProps = React.ComponentProps<'div'>;

type DockInputProps = React.ComponentProps<'input'>;

type DockSelectableProps = React.ComponentProps<'button'> & { selected: boolean; description?: React.ReactNode };

const variantStyles = {
  default: { header: 'text-foreground hover:bg-muted/50', icon: 'text-muted-foreground' },
  primary: { header: 'bg-primary/5 text-primary hover:bg-primary/10', icon: 'text-primary' },
  warning: { header: 'bg-warning/10 text-warning hover:bg-warning/20', icon: 'text-warning' },
  destructive: { header: 'bg-destructive/5 text-destructive hover:bg-destructive/10', icon: 'text-destructive' },
} satisfies Record<DockVariant, { header: string; icon: string }>;

type DockContainerProps = { docks: DockItem[]; className?: string };

function DockRoot({ className, ...props }: DockRootProps) {
  return <div className={cn('flex flex-col gap-3 text-sm', className)} {...props} />;
}

function DockInline({ className, ...props }: DockRootProps) {
  return <div className={cn('flex items-start gap-3', className)} {...props} />;
}

function DockIcon({ className, ...props }: DockIconProps) {
  return <div className={cn('mt-0.5 shrink-0', className)} {...props} />;
}

function DockBody({ className, ...props }: DockBodyProps) {
  return <div className={cn('min-w-0 flex-1', className)} {...props} />;
}

function DockTitle({ className, ...props }: DockTitleProps) {
  return <div className={cn('text-sm text-foreground', className)} {...props} />;
}

function DockDescription({ className, ...props }: DockDescriptionProps) {
  return <div className={cn('mt-1 text-xs text-muted-foreground', className)} {...props} />;
}

function DockActions({ className, ...props }: DockActionsProps) {
  return <div className={cn('flex flex-wrap items-center gap-2', className)} {...props} />;
}

function DockInput({ className, ...props }: DockInputProps) {
  return (
    <Input
      className={cn(
        'flex-1 rounded-md border-border bg-background px-2 text-sm focus:ring-1 focus:ring-primary focus-visible:ring-1 focus-visible:ring-primary',
        className,
      )}
      {...props}
    />
  );
}

function DockSelectable({ selected, description, children, className, ...props }: DockSelectableProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(
        'h-auto w-full items-start justify-start gap-2 rounded-md p-2 text-left',
        selected ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-accent',
        className,
      )}
      {...props}>
      <div
        className={cn(
          'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-primary bg-primary' : 'border-muted-foreground',
        )}>
        {selected ? <CheckIcon className="size-2 text-primary-foreground" /> : null}
      </div>
      <div className="min-w-0">
        <div className="truncate text-foreground">{children}</div>
        {description ? <div className="truncate text-xs text-muted-foreground">{description}</div> : null}
      </div>
    </Button>
  );
}

export const Dock = {
  Root: DockRoot,
  Inline: DockInline,
  Icon: DockIcon,
  Body: DockBody,
  Title: DockTitle,
  Description: DockDescription,
  Actions: DockActions,
  Input: DockInput,
  Selectable: DockSelectable,
};

function CollapsibleDockItem({ title, defaultExpanded = true, children, isLast, variant = 'default' }: DockItemProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const styles = variantStyles[variant];

  return (
    <div className={cn('overflow-hidden bg-transparent', !isLast && 'border-b border-border-subtle')}>
      <div className="flex items-center">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          className={cn(
            'h-auto flex-1 justify-start gap-3 px-4 py-3 text-left',
            'transition-colors duration-fast ease-standard',
            styles.header,
            'focus-visible:outline-none',
          )}>
          <span
            className={cn(
              'transition-transform duration-fast ease-standard',
              styles.icon,
              isExpanded ? 'rotate-0' : '-rotate-90',
            )}>
            <ChevronDownIcon className="size-4 shrink-0" />
          </span>
          <span>{title}</span>
        </Button>
      </div>

      <div
        className={cn(
          'grid transition-[opacity,grid-template-rows] duration-slow ease-standard',
          isExpanded ? 'opacity-100' : 'opacity-0',
        )}
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pt-1 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function DockContainer({ docks, className }: DockContainerProps) {
  const [renderedDocks, setRenderedDocks] = React.useState<DockItem[]>(docks);
  const [isOpen, setIsOpen] = React.useState(false);
  const hasDocks = docks.length > 0;

  // Keep the last non-empty docks mounted so the collapse transition can play out.
  if (hasDocks && renderedDocks !== docks) setRenderedDocks(docks);
  if (!hasDocks && isOpen) setIsOpen(false);

  React.useEffect(() => {
    if (!hasDocks) return;
    const frame = requestAnimationFrame(() => setIsOpen(true));
    return () => cancelAnimationFrame(frame);
  }, [hasDocks]);

  const handleTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (!hasDocks && !isOpen && event.target === event.currentTarget && event.propertyName === 'grid-template-rows') {
      setRenderedDocks([]);
    }
  };

  if (renderedDocks.length === 0) return null;

  return (
    <div
      className={cn(
        'pointer-events-auto grid transition-[grid-template-rows,opacity]',
        isOpen ? 'duration-slow ease-standard opacity-100' : 'duration-slow ease-emphasized opacity-0',
        className,
      )}
      style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      onTransitionEnd={handleTransitionEnd}>
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            'flex flex-col transition-transform',
            isOpen ? 'translate-y-0 duration-slow ease-standard' : 'translate-y-1 duration-slow ease-emphasized',
          )}>
          {renderedDocks.map((dock, index) => (
            <CollapsibleDockItem
              key={dock.id}
              title={dock.title}
              defaultExpanded={dock.defaultExpanded}
              variant={dock.variant}
              isLast={index === renderedDocks.length - 1}>
              {dock.children}
            </CollapsibleDockItem>
          ))}
        </div>
      </div>
    </div>
  );
}
