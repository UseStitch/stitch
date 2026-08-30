import { describe, expect, test } from 'bun:test';
import { z } from 'zod';

import { paginationFields } from './pagination.js';

const paginationSchema = z.object(paginationFields());

describe('paginationFields', () => {
  test.each([0, 101, 1.5])('rejects invalid maxResults %p', (maxResults) => {
    expect(paginationSchema.safeParse({ maxResults }).success).toBe(false);
  });

  test('defaults maxResults and rejects an empty pageToken', () => {
    expect(paginationSchema.parse({})).toEqual({ maxResults: 10 });
    expect(paginationSchema.safeParse({ pageToken: '' }).success).toBe(false);
  });
});
