export const LIQUID_UI_TOOL_NAME = 'render_ui';

export const LIQUID_UI_COMPONENTS = [
  'Stack',
  'Grid',
  'Row',
  'Card',
  'Badge',
  'Stat',
  'KeyValue',
  'Text',
  'Divider',
  'Chart',
] as const;

export const BADGE_VARIANTS = ['default', 'success', 'warning', 'destructive', 'info'] as const;
export const CHART_KINDS = ['line', 'bar', 'pie'] as const;
export const LIQUID_UI_SPACING = ['none', 'xs', 'sm', 'md', 'lg'] as const;
export const LIQUID_UI_COLUMNS = ['1', '2', '3', '4'] as const;
export const LIQUID_UI_ALIGNMENTS = ['start', 'center', 'end', 'between'] as const;
export const TEXT_VARIANTS = ['body', 'muted', 'heading', 'caption'] as const;
export const STAT_TRENDS = ['up', 'down', 'neutral'] as const;
