import { describe, expect, it, vi } from 'vitest';
import { computeTotalPages, paginatedQuery } from '../../src/lib/paginated-query.js';

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
      const mockData = [{ id: 1 }, { id: 2 }];
      const offsetSpy = vi.fn().mockResolvedValue(mockData);
      const limitSpy = vi.fn().mockReturnValue({ offset: offsetSpy });

      const mockDataQuery = { limit: limitSpy };
      const mockCountQuery = Promise.resolve([{ total: 25 }]);

      const result = await paginatedQuery({
        dataQuery: mockDataQuery,
        countQuery: mockCountQuery,
        page: 2,
        pageSize: 10,
      });

      expect(limitSpy).toHaveBeenCalledWith(10);
      expect(offsetSpy).toHaveBeenCalledWith(10); // (2-1) * 10
      expect(result).toEqual({
        items: mockData,
        page: 2,
        pageSize: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('handles empty result set properly', async () => {
      const offsetSpy = vi.fn().mockResolvedValue([]);
      const limitSpy = vi.fn().mockReturnValue({ offset: offsetSpy });

      const mockDataQuery = { limit: limitSpy };
      const mockCountQuery = Promise.resolve([{ total: 0 }]);

      const result = await paginatedQuery({
        dataQuery: mockDataQuery,
        countQuery: mockCountQuery,
        page: 1,
        pageSize: 10,
      });

      expect(limitSpy).toHaveBeenCalledWith(10);
      expect(offsetSpy).toHaveBeenCalledWith(0); // (1-1) * 10
      expect(result).toEqual({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
      });
    });

    it('applies transform function if provided', async () => {
      const mockData = [{ val: 1 }, { val: 2 }];
      const offsetSpy = vi.fn().mockResolvedValue(mockData);
      const limitSpy = vi.fn().mockReturnValue({ offset: offsetSpy });

      const mockDataQuery = { limit: limitSpy };
      const mockCountQuery = Promise.resolve([{ total: 2 }]);

      const result = await paginatedQuery({
        dataQuery: mockDataQuery,
        countQuery: mockCountQuery,
        page: 1,
        pageSize: 10,
        transform: (row: any) => ({ transformed: row.val * 2 }),
      });

      expect(result.items).toEqual([{ transformed: 2 }, { transformed: 4 }]);
    });
  });
});
