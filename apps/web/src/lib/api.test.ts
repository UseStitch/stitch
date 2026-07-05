import { describe, expect, it } from 'bun:test';

import { toQueryString } from '@/lib/api';

describe('toQueryString', () => {
  it('serializes values and skips undefined', () => {
    expect(toQueryString({ page: 2, pageSize: 30, listId: undefined })).toBe('?page=2&pageSize=30');
  });

  it('returns an empty string when no values are set', () => {
    expect(toQueryString({})).toBe('');
    expect(toQueryString({ q: undefined })).toBe('');
  });
});
