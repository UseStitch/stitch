import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DockItem = {
  id: string;
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
};

type DockItemProps = Omit<DockItem, 'id'> & {
  isFirst: boolean;
  isLast: boolean;
};

type DockContainerProps = {
  docks: DockItem[];
  className?: string;
};

function DockItem({ title, defaultExpanded = true, children, isFirst, isLast }: DockItemProps) {
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = React.useState<number>(0);

  React.useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContentHeight(entry.contentRect.height);
      }
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const currentHeight = isExpanded ? contentHeight + 36 : 36;

  return (
    <div
      className={cn(
        'overflow-hidden border-x border-border/60 bg-card/95 backdrop-blur-sm',
        isFirst && 'border-t rounded-t-xl',
        !isFirst && 'border-t-0',
        isLast && 'border-b-0 rounded-b-none',
      )}
      style={{
        height: `${currentHeight}px`,
        transition: 'height 250ms ease-out',
      }}
    >
      <div className="flex items-center border-b border-border/40 px-3 py-2">
        <button
          onClick={handleToggle}
          className={cn(
            'flex flex-1 items-center gap-2 text-left text-sm font-medium',
            'text-foreground transition-colors hover:text-foreground/80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          )}
        >
          <span
            className={cn(
              'transition-transform duration-200 ease-out',
              isExpanded ? 'rotate-0' : '-rotate-90',
            )}
          >
            <ChevronDownIcon className="size-4 shrink-0" />
          </span>
          <span>{title}</span>
        </button>
      </div>
      <div ref={contentRef} className={cn(!isExpanded && 'hidden')}>
        <div className="p-3">{children}</div>
      </div>
    </div>
  );
}

export function DockContainer({ docks, className }: DockContainerProps) {
  if (docks.length === 0) return null;

  return (
    <div className={cn('pointer-events-auto mx-auto flex max-w-4xl flex-col', className)}>
      {docks.map((dock, index) => (
        <DockItem
          key={dock.id}
          title={dock.title}
          defaultExpanded={dock.defaultExpanded}
          isFirst={index === 0}
          isLast={index === docks.length - 1}
        >
          {dock.children}
        </DockItem>
      ))}
    </div>
  );
}
