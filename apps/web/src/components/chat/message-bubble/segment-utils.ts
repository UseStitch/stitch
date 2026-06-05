import type { StoredPart } from '@stitch/shared/chat/messages';
import { LIQUID_UI_TOOL_NAME } from '@stitch/shared/liquid-ui/constants';

type TextSegment = { type: 'text'; text: string; key: string };
type ReasoningSegment = { type: 'reasoning'; text: string; key: string };
type OtherSegment = { type: 'other'; part: StoredPart; key: string };
type ToolCallGroupSegment = { type: 'tool-call-group'; parts: StoredPart[]; key: string };
type LiquidUiSegment = { type: 'liquid-ui'; part: StoredPart & { type: 'tool-call' }; key: string };
type DisplaySegment =
  | TextSegment
  | ReasoningSegment
  | OtherSegment
  | ToolCallGroupSegment
  | LiquidUiSegment;

type StoredToolResult = StoredPart & { type: 'tool-result' };

export function collectToolResults(parts: StoredPart[]): Map<string, StoredToolResult> {
  const map = new Map<string, StoredToolResult>();
  for (const part of parts) {
    if (part.type === 'tool-result') {
      map.set(part.toolCallId, part as StoredToolResult);
    }
  }
  return map;
}

export function buildDisplaySegments(parts: StoredPart[]): DisplaySegment[] {
  const segments: DisplaySegment[] = [];

  for (const part of parts) {
    if (part.type === 'tool-result') continue;

    if (part.type === 'text-delta') {
      const last = segments.at(-1);
      if (last?.type === 'text') {
        last.text += part.text;
      } else {
        segments.push({ type: 'text', text: part.text, key: `text-${segments.length}` });
      }
      continue;
    }

    if (part.type === 'reasoning-delta') {
      const last = segments.at(-1);
      if (last?.type === 'reasoning') {
        last.text += part.text;
      } else {
        segments.push({ type: 'reasoning', text: part.text, key: `reasoning-${segments.length}` });
      }
      continue;
    }

    if (
      part.type === 'text-start' ||
      part.type === 'text-end' ||
      part.type === 'reasoning-start' ||
      part.type === 'reasoning-end'
    ) {
      continue;
    }

    if (part.type === 'tool-call') {
      if (part.toolName === LIQUID_UI_TOOL_NAME) {
        segments.push({ type: 'liquid-ui', part, key: `liquid-ui-${segments.length}` });
        continue;
      }

      const last = segments.at(-1);
      if (last?.type === 'tool-call-group') {
        last.parts.push(part);
      } else {
        segments.push({ type: 'tool-call-group', parts: [part], key: `tools-${segments.length}` });
      }
      continue;
    }

    segments.push({ type: 'other', part, key: `other-${segments.length}` });
  }

  return segments;
}
