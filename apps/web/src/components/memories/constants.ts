import type { MemoryCategory, MemoryConfidence } from '@stitch/shared/memory/types';

export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: 'Preference',
  fact: 'Fact',
  workflow: 'Workflow',
  constraint: 'Constraint',
};

export const CATEGORY_VARIANTS: Record<
  MemoryCategory,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  preference: 'default',
  fact: 'secondary',
  workflow: 'outline',
  constraint: 'destructive',
};

export const CONFIDENCE_LABELS: Record<MemoryConfidence, string> = {
  stated: 'Stated',
  inferred: 'Inferred',
  confirmed: 'Confirmed',
};
