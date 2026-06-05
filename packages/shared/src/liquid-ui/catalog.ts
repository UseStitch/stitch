import { LIQUID_UI_COMPONENTS, type LiquidUiComponent } from './constants';

type LiquidUiCatalogItem = {
  name: LiquidUiComponent;
  description: string;
  props: string;
};

const LIQUID_UI_CATALOG: LiquidUiCatalogItem[] = [
  {
    name: 'Stack',
    description: 'Vertical layout for ordered groups. Do not use for unrelated comparisons.',
    props: 'children, spacing: none|xs|sm|md|lg',
  },
  {
    name: 'Grid',
    description: 'Responsive grid for cards, stats, or key values. Do not use for prose-only answers.',
    props: 'children, columns: 1|2|3|4, gap: none|xs|sm|md|lg',
  },
  {
    name: 'Row',
    description: 'Horizontal layout for compact related items. Do not use when wrapping would harm readability.',
    props: 'children, gap: none|xs|sm|md|lg, align: start|center|end|between',
  },
  {
    name: 'Card',
    description: 'Bounded section for grouped information. Do not use for a single short sentence.',
    props: 'title: string|null, description: string|null, children',
  },
  {
    name: 'Badge',
    description: 'Short status, category, or risk label. Do not use for long text.',
    props: 'variant: default|success|warning|destructive|info, text',
  },
  {
    name: 'Stat',
    description: 'Metric with label and value. Do not use for non-numeric prose.',
    props: 'label, value, caption: string|null, trend: up|down|neutral|null',
  },
  {
    name: 'KeyValue',
    description: 'One labeled fact. Do not use for paragraphs.',
    props: 'label, value',
  },
  {
    name: 'Text',
    description: 'Brief display text inside a UI block. Prefer normal assistant text for full explanations.',
    props: 'text, variant: body|muted|heading|caption',
  },
  {
    name: 'Divider',
    description: 'Visual separation between grouped items. Do not use repeatedly.',
    props: 'no props beyond id/component',
  },
  {
    name: 'Chart',
    description: 'Line, bar, or pie chart for real data. Do not invent data or use for tiny lists.',
    props: 'kind: line|bar|pie, title: string|null, labels, datasets: { label, data }[]',
  },
];

const catalogNames = new Set(LIQUID_UI_CATALOG.map((item) => item.name));
for (const component of LIQUID_UI_COMPONENTS) {
  if (!catalogNames.has(component)) {
    throw new Error(`Missing Liquid UI catalog entry for ${component}.`);
  }
}

export function buildLiquidUiCatalogPrompt(): string {
  return LIQUID_UI_CATALOG.map(
    (item) => `- ${item.name}: ${item.description} Props: ${item.props}.`,
  ).join('\n');
}
