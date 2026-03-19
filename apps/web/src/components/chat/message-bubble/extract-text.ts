import type { StoredPart } from '@openwork/shared/chat/messages';

export function extractTextFromParts(parts: StoredPart[]): string {
  return parts
    .filter((p) => p.type === 'text-delta')
    .map((p) => (p as Extract<typeof p, { type: 'text-delta' }>).text)
    .join('');
}
