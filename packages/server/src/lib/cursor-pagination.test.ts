import { describe, expect, test } from 'bun:test';

import { createdAtIdCursorSchema, createCursorPage, decodeCursor, encodeCursor } from '@/lib/cursor-pagination.js';

describe('cursor pagination', () => {
  test('round trips an opaque cursor', () => {
    const value = { createdAt: 123, id: 'item_1' };
    expect(decodeCursor(encodeCursor(value), createdAtIdCursorSchema)).toEqual(value);
  });

  test('rejects malformed cursors', () => {
    expect(() => decodeCursor('not-a-cursor', createdAtIdCursorSchema)).toThrow('Invalid pagination cursor');
  });

  test('uses a lookahead row to create the next cursor', () => {
    const page = createCursorPage([{ id: '1' }, { id: '2' }, { id: '3' }], 2, (item) => item.id);
    expect(page).toEqual({ items: [{ id: '1' }, { id: '2' }], nextCursor: '2' });
  });

  test('returns no cursor on the final page', () => {
    const page = createCursorPage([{ id: '1' }], 2, (item) => item.id);
    expect(page).toEqual({ items: [{ id: '1' }], nextCursor: null });
  });
});
