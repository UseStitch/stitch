import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

export type DockVariant = 'default' | 'primary' | 'warning' | 'destructive';

export type DockItem = {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  variant?: DockVariant;
};

type DockItemProps = Omit<DockItem, 'id'> & {
  isLast: boolean;
};

type DockRootProps = React.ComponentProps<'div'>;

type DockIconProps = React.ComponentProps<'div'>;

type DockBodyProps = React.ComponentProps<'div'>;

type DockTitleProps = React.ComponentProps<'div'>;

type DockDescriptionProps = React.ComponentProps<'div'>;

type DockActionsProps = React.ComponentProps<'div'>;

type DockInputProps = React.ComponentProps<'input'>;

type DockSelectableProps = React.ComponentProps<'button'> & {
  selected: boolean;
  description?: React.ReactNode;
};

const variantStyles = {
  default: {
    header: 'text-foreground hover:bg-muted/50',
    icon: 'text-muted-foreground',
  },
  primary: {
    header: 'bg-primary/5 text-primary hover:bg-primary/10',
    icon: 'text-primary',
  },
  warning: {
    header: 'bg-warning/10 text-warning hover:bg-warning/20',
    icon: 'text-warning',
  },
  destructive: {
    header: 'bg-destructive/5 text-destructive hover:bg-destructive/10',
    icon: 'text-destructive',
  },
} satisfies Record<DockVariant, { header: string; icon: string }>;

type DockContainerProps = {
  docks: DockItem[];
  className?: string;
};

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
    <input
      className={cn(
        'h-8 flex-1 rounded-md border border-border bg-background px-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

function DockSelectable({
  selected,
  description,
  children,
  className,
  ...props
}: DockSelectableProps) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-start gap-2 rounded-md border p-2 text-left text-sm transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-primary bg-primary' : 'border-muted-foreground',
        )}
      >
        {selected ? <CheckIcon className="size-2 text-primary-foreground" /> : null}
      </div>
      <div className="min-w-0">
        <div className="truncate text-foreground">{children}</div>
        {description ? (
          <div className="truncate text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
    </button>
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

function CollapsibleDockItem({
  title,
  defaultExpanded = true,
  children,
  isLast,
  variant = 'default',
}: DockItemProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const styles = variantStyles[variant];

  return (
    <div className={cn('overflow-hidden bg-transparent', !isLast && 'border-b border-border/60')}>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          className={cn(
            'flex flex-1 items-center gap-3 px-4 py-3 text-left text-sm font-medium',
            'transition-colors duration-150 ease-out',
            styles.header,
            'focus-visible:outline-none',
          )}
        >
          <span
            className={cn(
              'transition-transform duration-150 ease-out',
              styles.icon,
              isExpanded ? 'rotate-0' : '-rotate-90',
            )}
          >
            <ChevronDownIcon className="size-4 shrink-0" />
          </span>
          <span>{title}</span>
        </button>
      </div>

      <div
        className={cn(
          'grid transition-[opacity,grid-template-rows] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
          isExpanded ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
        }}
      >
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

  React.useEffect(() => {
    if (hasDocks) {
      setRenderedDocks(docks);
      const frame = requestAnimationFrame(() => setIsOpen(true));
      return () => cancelAnimationFrame(frame);
    }

    setIsOpen(false);
  }, [docks, hasDocks]);

  const handleTransitionEnd = React.useCallback(
    (event: React.TransitionEvent<HTMLDivElement>) => {
      if (
        !hasDocks &&
        !isOpen &&
        event.target === event.currentTarget &&
        event.propertyName === 'grid-template-rows'
      ) {
        setRenderedDocks([]);
      }
    },
    [hasDocks, isOpen],
  );

  if (renderedDocks.length === 0) return null;

  return (
    <div
      className={cn(
        'pointer-events-auto grid transition-[grid-template-rows,opacity]',
        isOpen
          ? 'duration-340 ease-[cubic-bezier(0.23,1,0.32,1)] opacity-100'
          : 'duration-300 ease-in opacity-0',
        className,
      )}
      style={{
        gridTemplateRows: isOpen ? '1fr' : '0fr',
      }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          className={cn(
            'flex flex-col transition-transform',
            isOpen
              ? 'translate-y-0 duration-340 ease-[cubic-bezier(0.23,1,0.32,1)]'
              : 'translate-y-1 duration-300 ease-in',
          )}
        >
          {renderedDocks.map((dock, index) => (
            <CollapsibleDockItem
              key={dock.id}
              title={dock.title}
              defaultExpanded={dock.defaultExpanded}
              variant={dock.variant}
              isLast={index === renderedDocks.length - 1}
            >
              {dock.children}
            </CollapsibleDockItem>
          ))}
        </div>
      </div>
    </div>
  );
}
