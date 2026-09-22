import { z } from 'zod';

import {
  BADGE_VARIANTS,
  CHART_KINDS,
  LIQUID_UI_ALIGNMENTS,
  LIQUID_UI_COLUMNS,
  LIQUID_UI_SPACING,
  STAT_TRENDS,
  TEXT_VARIANTS,
} from '@stitch/shared/liquid-ui/constants';
import { parseLiquidUiSpec } from '@stitch/shared/liquid-ui/parse';
import type { JsonValue } from '@stitch/shared/json';
import type { LiquidUiSpec } from '@stitch/shared/liquid-ui/schema';

const idSchema = z.string();
const childrenSchema = z.array(z.json()).catch([]).transform((children) =>
  children.flatMap((child) => {
    const parsed = idSchema.safeParse(child);
    return parsed.success ? [parsed.data] : [];
  }),
);
const nullableStringSchema = z.string().nullable().catch(null);
const repairedNodeBaseSchema = z.object({ id: idSchema });

const repairedNodeSchema = z.discriminatedUnion('component', [
  repairedNodeBaseSchema.extend({
    component: z.literal('Stack'),
    spacing: z.enum(LIQUID_UI_SPACING).catch('sm'),
    children: childrenSchema,
  }),
  repairedNodeBaseSchema.extend({
    component: z.literal('Grid'),
    columns: z.coerce.string().pipe(z.enum(LIQUID_UI_COLUMNS)).catch('1'),
    gap: z.enum(LIQUID_UI_SPACING).catch('sm'),
    children: childrenSchema,
  }),
  repairedNodeBaseSchema.extend({
    component: z.literal('Row'),
    gap: z.enum(LIQUID_UI_SPACING).catch('sm'),
    align: z.enum(LIQUID_UI_ALIGNMENTS).catch('start'),
    children: childrenSchema,
  }),
  repairedNodeBaseSchema.extend({
    component: z.literal('Card'),
    title: nullableStringSchema,
    description: nullableStringSchema,
    children: childrenSchema,
  }),
  repairedNodeBaseSchema.extend({
    component: z.literal('Badge'),
    variant: z.enum(BADGE_VARIANTS).catch('default'),
    text: z.string(),
  }),
  repairedNodeBaseSchema.extend({
    component: z.literal('Stat'),
    label: z.string(),
    value: z.string(),
    caption: nullableStringSchema,
    trend: z.enum(STAT_TRENDS).nullable().catch(null),
  }),
  repairedNodeBaseSchema.extend({ component: z.literal('KeyValue'), label: z.string(), value: z.string() }),
  repairedNodeBaseSchema.extend({
    component: z.literal('Text'),
    text: z.string(),
    variant: z.enum(TEXT_VARIANTS).catch('body'),
  }),
  repairedNodeBaseSchema.extend({ component: z.literal('Divider') }),
  repairedNodeBaseSchema.extend({
    component: z.literal('Chart'),
    kind: z.enum(CHART_KINDS).catch('bar'),
    title: nullableStringSchema,
    labels: z.array(z.string()).catch([]),
    datasets: z.array(z.json()).catch([]),
  }),
]);

const repairableSpecSchema = z.object({ root: idSchema, nodes: z.array(z.json()) });

export function repairLiquidUiSpec(input: JsonValue): LiquidUiSpec | null {
  const parsed = parseLiquidUiSpec(input);
  if (parsed.ok) return parsed.spec;

  const repairable = repairableSpecSchema.safeParse(input);
  if (!repairable.success) return null;

  const repaired = {
    root: repairable.data.root,
    nodes: repairable.data.nodes.flatMap((node) => {
      const result = repairedNodeSchema.safeParse(node);
      return result.success ? [result.data] : [];
    }),
  };
  const repairedParsed = parseLiquidUiSpec(repaired);
  return repairedParsed.ok ? repairedParsed.spec : null;
}
