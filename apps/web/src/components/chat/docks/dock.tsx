import { ChevronDownIcon } from 'lucide-react';
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
    header: 'bg-amber-500/5 text-amber-600 dark:text-amber-500 hover:bg-amber-500/10',
    icon: 'text-amber-500',
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

function DockItem({
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
          onClick={() => setIsExpanded((prev) => !prev)}
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
            <DockItem
              key={dock.id}
              title={dock.title}
              defaultExpanded={dock.defaultExpanded}
              variant={dock.variant}
              isLast={index === renderedDocks.length - 1}
            >
              {dock.children}
            </DockItem>
          ))}
        </div>
      </div>
    </div>
  );
}
