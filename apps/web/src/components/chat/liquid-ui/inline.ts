import type { LiquidUiSpec } from '@stitch/shared/liquid-ui/schema';

import { repairLiquidUiSpec } from './repair.js';

const INLINE_LIQUID_UI_PATTERN = /<liquid_ui>\s*([\s\S]*?)\s*<\/liquid_ui>/gi;

type InlineLiquidUiSegment =
  | { type: 'text'; text: string }
  | { type: 'liquid-ui'; spec: LiquidUiSpec };

export function parseInlineLiquidUiText(text: string): InlineLiquidUiSegment[] | null {
  const segments: InlineLiquidUiSegment[] = [];
  let lastIndex = 0;
  let found = false;

  for (const match of text.matchAll(INLINE_LIQUID_UI_PATTERN)) {
    found = true;
    const [fullMatch, jsonText] = match;
    const index = match.index ?? 0;

    if (index > lastIndex) {
      segments.push({ type: 'text', text: text.slice(lastIndex, index) });
    }

    try {
      const spec = repairLiquidUiSpec(JSON.parse(jsonText ?? ''));
      if (!spec) return null;
      segments.push({ type: 'liquid-ui', spec });
    } catch {
      return null;
    }

    lastIndex = index + fullMatch.length;
  }

  if (!found) return null;

  if (lastIndex < text.length) {
    segments.push({ type: 'text', text: text.slice(lastIndex) });
  }

  return segments;
}
