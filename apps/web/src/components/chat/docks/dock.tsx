import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
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
  isFirst: boolean;
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
  isFirst,
  isLast,
  variant = 'default',
}: DockItemProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const styles = variantStyles[variant];

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div
      className={cn(
        'overflow-hidden border-x border-border/60 bg-card/95 backdrop-blur-sm transition-all duration-300',
        isFirst && 'border-t rounded-t-2xl',
        !isFirst && 'border-t-0',
        isLast && 'border-b-0 rounded-b-none',
        !isLast && 'border-b',
      )}
    >
      <div className="flex items-center">
        <button
          onClick={handleToggle}
          className={cn(
            'flex flex-1 items-center gap-3 text-left text-sm font-medium px-4 py-3',
            'transition-colors',
            styles.header,
            'focus-visible:outline-none',
          )}
        >
          <span
            className={cn(
              'transition-transform duration-200 ease-out',
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
          'grid transition-all duration-200 ease-out',
          isExpanded ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
        }}
      >
        <div className="overflow-hidden min-h-0">
          <div className="px-4 pb-4 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function DockContainer({ docks, className }: DockContainerProps) {
  const [renderedDocks, setRenderedDocks] = React.useState<
    { dock: DockItem; isExiting: boolean }[]
  >([]);

  React.useEffect(() => {
    setRenderedDocks((prev) => {
      const next: { dock: DockItem; isExiting: boolean }[] = [];
      const incomingIds = new Set(docks.map((d) => d.id));

      let prevIndex = 0;
      let newIndex = 0;

      while (prevIndex < prev.length && newIndex < docks.length) {
        const p = prev[prevIndex]!;
        const d = docks[newIndex]!;

        if (p.dock.id === d.id) {
          next.push({ dock: d, isExiting: false });
          prevIndex++;
          newIndex++;
        } else if (!incomingIds.has(p.dock.id)) {
          next.push({ dock: p.dock, isExiting: true });
          prevIndex++;
        } else {
          next.push({ dock: d, isExiting: false });
          newIndex++;
        }
      }

      while (prevIndex < prev.length) {
        const p = prev[prevIndex]!;
        if (!incomingIds.has(p.dock.id)) {
          next.push({ dock: p.dock, isExiting: true });
        }
        prevIndex++;
      }

      while (newIndex < docks.length) {
        next.push({ dock: docks[newIndex]!, isExiting: false });
        newIndex++;
      }

      return next;
    });
  }, [docks]);

  const handleExited = React.useCallback((id: string) => {
    setRenderedDocks((prev) => prev.filter((d) => !(d.dock.id === id && d.isExiting)));
  }, []);

  if (renderedDocks.length === 0) return null;

  return (
    <div className={cn('pointer-events-auto mx-auto flex max-w-4xl flex-col', className)}>
      {renderedDocks.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index === renderedDocks.length - 1;

        return (
          <AnimatedDockItem
            key={item.dock.id}
            dock={item.dock}
            isExiting={item.isExiting}
            isFirst={isFirst}
            isLast={isLast}
            onExited={() => handleExited(item.dock.id)}
          />
        );
      })}
    </div>
  );
}

function AnimatedDockItem({
  dock,
  isExiting,
  isFirst,
  isLast,
  onExited,
}: {
  dock: DockItem;
  isExiting: boolean;
  isFirst: boolean;
  isLast: boolean;
  onExited: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);

  React.useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const show = mounted && !isExiting;

  return (
    <div
      className={cn(
        'grid transition-all duration-300 ease-in-out',
        show ? 'opacity-100' : 'opacity-0',
      )}
      style={{
        gridTemplateRows: show ? '1fr' : '0fr',
      }}
      onTransitionEnd={(e) => {
        if (
          isExiting &&
          (e.propertyName === 'grid-template-rows' || e.propertyName === 'opacity')
        ) {
          onExited();
        }
      }}
    >
      <div className="overflow-hidden min-h-0">
        <DockItem
          title={dock.title}
          defaultExpanded={dock.defaultExpanded}
          variant={dock.variant}
          isFirst={isFirst}
          isLast={isLast}
        >
          {dock.children}
        </DockItem>
      </div>
    </div>
  );
}
