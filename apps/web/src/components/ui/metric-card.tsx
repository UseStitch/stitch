import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const metricCardVariants = cva('relative overflow-hidden', {
  variants: { size: { default: 'shadow-sm', compact: 'min-h-16' } },
  defaultVariants: { size: 'default' },
});

const metricCardValueVariants = cva('tabular-nums', {
  variants: {
    size: { default: 'text-3xl font-bold', compact: 'text-lg font-semibold' },
    emphasis: { default: '', destructive: 'text-destructive' },
  },
  defaultVariants: { size: 'default', emphasis: 'default' },
});

const metricCardIconVariants = cva('pointer-events-none absolute top-3 right-3 [&>svg]:size-5!', {
  variants: { emphasis: { default: 'text-muted-foreground/25', destructive: 'text-destructive/35' } },
  defaultVariants: { emphasis: 'default' },
});

type MetricCardProps = {
  label: string;
  value: React.ReactNode;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
} & VariantProps<typeof metricCardValueVariants>;

function MetricCard({
  label,
  value,
  description,
  icon,
  emphasis = 'default',
  size = 'default',
  className,
}: MetricCardProps) {
  return (
    <Card
      data-slot="metric-card"
      size={size === 'compact' ? 'sm' : 'default'}
      className={cn(metricCardVariants({ size }), className)}>
      {icon && <span className={cn(metricCardIconVariants({ emphasis }))}>{icon}</span>}
      <CardHeader className={size === 'compact' ? 'pr-8' : undefined}>
        <CardDescription className={size === 'compact' ? 'text-xs' : undefined}>{label}</CardDescription>
        <CardTitle className={cn(metricCardValueVariants({ size, emphasis }))}>{value}</CardTitle>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardHeader>
    </Card>
  );
}

export { MetricCard };
