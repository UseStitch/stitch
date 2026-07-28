import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import * as React from 'react';

import { Icon } from '@/components/primitives/icon.js';
import { Stack } from '@/components/primitives/stack.js';
import { Text } from '@/components/primitives/text.js';
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

type DockTitleProps = { children: React.ReactNode; title?: string; tone?: 'default' | 'destructive'; lineClamp?: '2' };

type DockDescriptionProps = { children: React.ReactNode; tone?: 'muted' | 'destructive'; flush?: boolean };

type DockActionsProps = React.ComponentProps<'div'>;

type DockInputProps = React.ComponentProps<'input'>;

type DockSelectableProps = React.ComponentProps<'button'> & { selected: boolean; description?: React.ReactNode };

const variantStyles = {
  default: { header: 'text-foreground hover:bg-accent', icon: 'text-muted-foreground' },
  primary: { header: 'bg-primary-subtle text-primary hover:bg-primary-subtle', icon: 'text-primary' },
  warning: { header: 'bg-warning-subtle text-warning hover:bg-warning-subtle', icon: 'text-warning' },
  destructive: {
    header: 'bg-destructive-subtle text-destructive hover:bg-destructive-subtle',
    icon: 'text-destructive',
  },
} satisfies Record<DockVariant, { header: string; icon: string }>;

type DockContainerProps = { docks: DockItem[]; className?: string };

function DockRoot({ children }: DockRootProps) {
  return <Stack gap="l">{children}</Stack>;
}

function DockInline({ className, ...props }: DockRootProps) {
  const { children, ...rest } = props;
  return (
    <div className={className} {...rest}>
      <Stack direction="row" align="start" gap="l">
        {children}
      </Stack>
    </div>
  );
}

function DockIcon({ className, ...props }: DockIconProps) {
  return <div className={cn('mt-space-2xs shrink-0', className)} {...props} />;
}

function DockBody({ className, ...props }: DockBodyProps) {
  return <div className={cn('min-w-0 flex-1', className)} {...props} />;
}

function DockTitle({ tone = 'default', lineClamp, ...props }: DockTitleProps) {
  return <Text as="div" variant="body" tone={tone} lineClamp={lineClamp} {...props} />;
}

function DockDescription({ tone = 'muted', flush = false, ...props }: DockDescriptionProps) {
  return (
    <div className={flush ? undefined : 'mt-space-xs'}>
      <Text as="div" variant="caption" tone={tone} {...props} />
    </div>
  );
}

function DockActions({ className, ...props }: DockActionsProps) {
  const { children, ...rest } = props;
  return (
    <div className={className} {...rest}>
      <Stack direction="row" align="center" gap="m" wrap>
        {children}
      </Stack>
    </div>
  );
}

function DockInput({ className, ...props }: DockInputProps) {
  return (
    <Input
      className={cn(
        'flex-1 rounded-md border-border bg-background px-space-m text-sm focus:ring-1 focus:ring-primary focus-visible:ring-1 focus-visible:ring-primary',
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
      variant={selected ? 'secondary' : 'outline'}
      width="full"
      align="start"
      className={cn('items-start gap-space-m', className)}
      {...props}>
      <div
        className={cn(
          'mt-space-2xs flex size-3.5 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-primary bg-primary' : 'border-muted-foreground',
        )}>
        {selected ? <Icon as={CheckIcon} size="xs" color="var(--primary-foreground)" /> : null}
      </div>
      <div className="min-w-0">
        <Text as="div" variant="body" truncate>
          {children}
        </Text>
        {description ? (
          <Text as="div" variant="caption" tone="muted" truncate>
            {description}
          </Text>
        ) : null}
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
      <div className={styles.header}>
        <Button
          type="button"
          variant="quiet"
          width="full"
          align="start"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          className="gap-space-l">
          <span
            className={cn(
              'transition-transform duration-fast ease-standard',
              styles.icon,
              isExpanded ? 'rotate-0' : '-rotate-90',
            )}>
            <Icon as={ChevronDownIcon} size="m" />
          </span>
          <Text as="span" variant="body-strong">
            {title}
          </Text>
        </Button>
      </div>

      <div
        className={cn(
          'grid transition-[opacity,grid-template-rows] duration-slow ease-standard',
          isExpanded ? 'opacity-100' : 'opacity-0',
        )}
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}>
        <div className="min-h-0 overflow-hidden">
          <div className="px-space-xl pt-space-xs pb-space-xl">{children}</div>
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
