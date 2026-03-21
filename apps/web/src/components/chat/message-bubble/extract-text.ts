import type { StoredPart } from '@stitch/shared/chat/messages';

export function extractTextFromParts(parts: StoredPart[]): string {
  return parts
    .filter((p): p is Extract<StoredPart, { type: 'text-delta' }> => p.type === 'text-delta')
    .map((p) => p.text)
    .join('');
}
