import type { StoredPart } from '@stitch/shared/chat/messages';

type TextSegment = { type: 'text'; text: string; key: string };
type ReasoningSegment = { type: 'reasoning'; text: string; key: string };
type OtherSegment = { type: 'other'; part: StoredPart; key: string };
type DisplaySegment = TextSegment | ReasoningSegment | OtherSegment;

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

    segments.push({ type: 'other', part, key: `other-${segments.length}` });
  }

  return segments;
}
