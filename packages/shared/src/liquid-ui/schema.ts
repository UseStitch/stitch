import { z } from 'zod';

import {
  BADGE_VARIANTS,
  CHART_KINDS,
  LIQUID_UI_ALIGNMENTS,
  LIQUID_UI_COLUMNS,
  LIQUID_UI_SPACING,
  STAT_TRENDS,
  TEXT_VARIANTS,
} from './constants';

const idSchema = z.string().trim().min(1);
const childrenSchema = z.array(idSchema);
const baseNodeSchema = z.object({ id: idSchema });

const stackNodeSchema = baseNodeSchema
  .extend({
    component: z.literal('Stack'),
    children: childrenSchema,
    spacing: z.enum(LIQUID_UI_SPACING),
  })
  .strict();

const gridNodeSchema = baseNodeSchema
  .extend({
    component: z.literal('Grid'),
    children: childrenSchema,
    columns: z.enum(LIQUID_UI_COLUMNS),
    gap: z.enum(LIQUID_UI_SPACING),
  })
  .strict();

const rowNodeSchema = baseNodeSchema
  .extend({
    component: z.literal('Row'),
    children: childrenSchema,
    gap: z.enum(LIQUID_UI_SPACING),
    align: z.enum(LIQUID_UI_ALIGNMENTS),
  })
  .strict();

const cardNodeSchema = baseNodeSchema
  .extend({
    component: z.literal('Card'),
    title: z.string().nullable(),
    description: z.string().nullable(),
    children: childrenSchema,
  })
  .strict();

const badgeNodeSchema = baseNodeSchema
  .extend({
    component: z.literal('Badge'),
    variant: z.enum(BADGE_VARIANTS),
    text: z.string().trim().min(1),
  })
  .strict();

const statNodeSchema = baseNodeSchema
  .extend({
    component: z.literal('Stat'),
    label: z.string().trim().min(1),
    value: z.string().trim().min(1),
    caption: z.string().nullable(),
    trend: z.enum(STAT_TRENDS).nullable(),
  })
  .strict();

const keyValueNodeSchema = baseNodeSchema
  .extend({
    component: z.literal('KeyValue'),
    label: z.string().trim().min(1),
    value: z.string().trim().min(1),
  })
  .strict();

const textNodeSchema = baseNodeSchema
  .extend({
    component: z.literal('Text'),
    text: z.string().trim().min(1),
    variant: z.enum(TEXT_VARIANTS),
  })
  .strict();

const dividerNodeSchema = baseNodeSchema.extend({ component: z.literal('Divider') }).strict();

const chartDatasetSchema = z
  .object({
    label: z.string().trim().min(1),
    data: z.array(z.number()),
  })
  .strict();

const chartNodeSchema = baseNodeSchema
  .extend({
    component: z.literal('Chart'),
    kind: z.enum(CHART_KINDS),
    title: z.string().nullable(),
    labels: z.array(z.string()),
    datasets: z.array(chartDatasetSchema).min(1),
  })
  .strict();

export const liquidUiNodeSchema = z.discriminatedUnion('component', [
  stackNodeSchema,
  gridNodeSchema,
  rowNodeSchema,
  cardNodeSchema,
  badgeNodeSchema,
  statNodeSchema,
  keyValueNodeSchema,
  textNodeSchema,
  dividerNodeSchema,
  chartNodeSchema,
]);

export type LiquidUiNode = z.infer<typeof liquidUiNodeSchema>;
export type LiquidUiSpec = z.infer<typeof liquidUiSpecSchema>;

function getChildren(node: LiquidUiNode): string[] {
  return 'children' in node ? node.children : [];
}

function validateGraph(spec: { root: string; nodes: LiquidUiNode[] }, ctx: z.RefinementCtx) {
  const nodesById = new Map<string, LiquidUiNode>();
  for (const node of spec.nodes) {
    if (nodesById.has(node.id)) {
      ctx.addIssue({ code: 'custom', path: ['nodes'], message: `Duplicate node id "${node.id}".` });
    }
    nodesById.set(node.id, node);
  }

  if (!nodesById.has(spec.root)) {
    ctx.addIssue({
      code: 'custom',
      path: ['root'],
      message: `Root node "${spec.root}" does not exist.`,
    });
    return;
  }

  for (const node of spec.nodes) {
    for (const childId of getChildren(node)) {
      if (!nodesById.has(childId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes'],
          message: `Node "${node.id}" references missing child "${childId}".`,
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reachable = new Set<string>();

  function visit(id: string): boolean {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    const node = nodesById.get(id);
    if (!node) return true;

    visiting.add(id);
    reachable.add(id);
    for (const childId of getChildren(node)) {
      if (!visit(childId)) return false;
    }
    visiting.delete(id);
    visited.add(id);
    return true;
  }

  if (!visit(spec.root)) {
    ctx.addIssue({ code: 'custom', path: ['nodes'], message: 'Component graph contains a cycle.' });
  }

  for (const node of spec.nodes) {
    if (!reachable.has(node.id)) {
      ctx.addIssue({ code: 'custom', path: ['nodes'], message: `Node "${node.id}" is orphaned.` });
    }
  }
}

export const liquidUiSpecSchema = z
  .object({
    root: idSchema,
    nodes: z.array(liquidUiNodeSchema).min(1),
  })
  .strict()
  .superRefine(validateGraph);
