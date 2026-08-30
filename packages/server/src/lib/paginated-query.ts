import type { PaginatedResult } from '@stitch/shared/pagination';

/**
 * Compute totalPages from a total count and pageSize.
 * Standalone helper for cases where the full paginatedQuery isn't needed.
 */
function computeTotalPages(total: number, pageSize: number): number {
  return total === 0 ? 0 : Math.ceil(total / pageSize);
}

type PaginatedQueryInput<TRow> = {
  dataQuery: { limit: (n: number) => { offset: (n: number) => Promise<TRow[]> | PromiseLike<TRow[]> } };
  count: Promise<number>;
  page: number;
  pageSize: number;
};

/**
 * Runs a paginated data query in parallel with a count query.
 * Returns a standardized envelope with items, page, pageSize, total, totalPages.
 *
 * @param dataQuery - A Drizzle query builder. limit() and offset() will be applied.
 * @param count     - A db.$count promise or count Promise<number>
 * @param page      - 1-indexed page number
 * @param pageSize  - Items per page
 */
export async function paginatedQuery<TRow>(input: PaginatedQueryInput<TRow>): Promise<PaginatedResult<TRow>> {
  const offset = (input.page - 1) * input.pageSize;

  const [items, total] = await Promise.all([input.dataQuery.limit(input.pageSize).offset(offset), input.count]);

  return {
    items,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: computeTotalPages(total, input.pageSize),
  };
}
