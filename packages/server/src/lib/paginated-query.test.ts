import { describe, expect, it } from 'bun:test';

import { computeTotalPages, paginatedQuery } from '@/lib/paginated-query.js';

describe('paginated-query', () => {
  describe('computeTotalPages', () => {
    it('returns 0 for 0 total items', () => {
      expect(computeTotalPages(0, 10)).toBe(0);
    });

    it('calculates correct total pages for exact multiples', () => {
      expect(computeTotalPages(20, 10)).toBe(2);
    });

    it('calculates correct total pages for partial pages', () => {
      expect(computeTotalPages(21, 10)).toBe(3);
    });
  });

  describe('paginatedQuery', () => {
    it('applies offset and limit correctly and computes totalPages', async () => {
      const data = [{ id: 1 }, { id: 2 }];
      let capturedLimit: number | undefined;
      let capturedOffset: number | undefined;

      const dataQuery = {
        limit(n: number) {
          capturedLimit = n;
          return {
            offset(o: number) {
              capturedOffset = o;
              return Promise.resolve(data);
            },
          };
        },
      };

      const result = await paginatedQuery({
        dataQuery,
        countQuery: Promise.resolve([{ total: 25 }]),
        page: 2,
        pageSize: 10,
      });

      expect(capturedLimit).toBe(10);
      expect(capturedOffset).toBe(10); // (2-1) * 10
      expect(result).toEqual({
        items: data,
        page: 2,
        pageSize: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('handles empty result set properly', async () => {
      let capturedLimit: number | undefined;
      let capturedOffset: number | undefined;

      const dataQuery = {
        limit(n: number) {
          capturedLimit = n;
          return {
            offset(o: number) {
              capturedOffset = o;
              return Promise.resolve([]);
            },
          };
        },
      };

      const result = await paginatedQuery({
        dataQuery,
        countQuery: Promise.resolve([{ total: 0 }]),
        page: 1,
        pageSize: 10,
      });

      expect(capturedLimit).toBe(10);
      expect(capturedOffset).toBe(0); // (1-1) * 10
      expect(result).toEqual({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      });
    });

    it('applies transform function if provided', async () => {
      const data = [{ val: 1 }, { val: 2 }];

      const dataQuery = {
        limit(_n: number) {
          return { offset(_o: number) { return Promise.resolve(data); } };
        },
      };

      const result = await paginatedQuery({
        dataQuery,
        countQuery: Promise.resolve([{ total: 2 }]),
        page: 1,
        pageSize: 10,
        transform: (row: { val: number }) => ({ transformed: row.val * 2 }),
      });

      expect(result.items).toEqual([{ transformed: 2 }, { transformed: 4 }]);
    });
  });
});
