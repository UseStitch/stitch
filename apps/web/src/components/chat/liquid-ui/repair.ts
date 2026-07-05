import { LIQUID_UI_COLUMNS, STAT_TRENDS } from '@stitch/shared/liquid-ui/constants';
import { parseLiquidUiSpec } from '@stitch/shared/liquid-ui/parse';
import type { LiquidUiSpec } from '@stitch/shared/liquid-ui/schema';

type JsonRecord = Record<string, unknown>;
type LiquidUiColumn = (typeof LIQUID_UI_COLUMNS)[number];
type StatTrend = (typeof STAT_TRENDS)[number];

function isObject(input: unknown): input is JsonRecord {
  return input !== null && typeof input === 'object';
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function childrenOrEmpty(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((child): child is string => typeof child === 'string') : [];
}

function normalizeColumns(value: unknown): string {
  const normalized = typeof value === 'number' ? String(value) : value;
  return typeof normalized === 'string' && LIQUID_UI_COLUMNS.includes(normalized as LiquidUiColumn) ? normalized : '1';
}

function normalizeTrend(value: unknown): 'up' | 'down' | 'neutral' | null {
  return typeof value === 'string' && STAT_TRENDS.includes(value as StatTrend) ? (value as StatTrend) : null;
}

function repairNode(node: unknown): JsonRecord | null {
  if (!isObject(node) || typeof node.id !== 'string' || typeof node.component !== 'string') {
    return null;
  }

  switch (node.component) {
    case 'Stack':
      return {
        id: node.id,
        component: 'Stack',
        spacing: typeof node.spacing === 'string' ? node.spacing : 'sm',
        children: childrenOrEmpty(node.children),
      };
    case 'Grid':
      return {
        id: node.id,
        component: 'Grid',
        columns: normalizeColumns(node.columns),
        gap: typeof node.gap === 'string' ? node.gap : 'sm',
        children: childrenOrEmpty(node.children),
      };
    case 'Row':
      return {
        id: node.id,
        component: 'Row',
        gap: typeof node.gap === 'string' ? node.gap : 'sm',
        align: typeof node.align === 'string' ? node.align : 'start',
        children: childrenOrEmpty(node.children),
      };
    case 'Card':
      return {
        id: node.id,
        component: 'Card',
        title: stringOrNull(node.title),
        description: stringOrNull(node.description),
        children: childrenOrEmpty(node.children),
      };
    case 'Badge':
      return {
        id: node.id,
        component: 'Badge',
        variant: typeof node.variant === 'string' ? node.variant : 'default',
        text: node.text,
      };
    case 'Stat':
      return {
        id: node.id,
        component: 'Stat',
        label: node.label,
        value: node.value,
        caption: stringOrNull(node.caption),
        trend: normalizeTrend(node.trend),
      };
    case 'KeyValue':
      return { id: node.id, component: 'KeyValue', label: node.label, value: node.value };
    case 'Text':
      return {
        id: node.id,
        component: 'Text',
        text: node.text,
        variant: typeof node.variant === 'string' ? node.variant : 'body',
      };
    case 'Divider':
      return { id: node.id, component: 'Divider' };
    case 'Chart':
      return {
        id: node.id,
        component: 'Chart',
        kind: typeof node.kind === 'string' ? node.kind : 'bar',
        title: stringOrNull(node.title),
        labels: Array.isArray(node.labels) ? node.labels : [],
        datasets: Array.isArray(node.datasets) ? node.datasets : [],
      };
    default:
      return null;
  }
}

export function repairLiquidUiSpec(input: unknown): LiquidUiSpec | null {
  const parsed = parseLiquidUiSpec(input);
  if (parsed.ok) return parsed.spec;

  if (!isObject(input) || typeof input.root !== 'string' || !Array.isArray(input.nodes)) {
    return null;
  }

  const repaired = {
    root: input.root,
    nodes: input.nodes.flatMap((node) => {
      const repairedNode = repairNode(node);
      return repairedNode ? [repairedNode] : [];
    }),
  };

  const repairedParsed = parseLiquidUiSpec(repaired);
  return repairedParsed.ok ? repairedParsed.spec : null;
}
