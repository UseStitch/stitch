type PaginatedResult<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number };

/**
 * Compute totalPages from a total count and pageSize.
 * Standalone helper for cases where the full paginatedQuery isn't needed.
 */
export function computeTotalPages(total: number, pageSize: number): number {
  return total === 0 ? 0 : Math.ceil(total / pageSize);
}

type PaginatedQueryInput<TRow> = {
  dataQuery: { limit: (n: number) => { offset: (n: number) => Promise<TRow[]> | PromiseLike<TRow[]> } };
  countQuery: PromiseLike<{ total: number }[]>;
  page: number;
  pageSize: number;
};

/**
 * Runs a paginated data query in parallel with a count query.
 * Returns a standardized envelope with items, page, pageSize, total, totalPages.
 *
 * @param dataQuery  - A Drizzle query builder. limit() and offset() will be applied.
 * @param countQuery - A Drizzle count query (e.g. db.select({ total: sql\`count(*)\` }).from(table).where(...))
 * @param page       - 1-indexed page number
 * @param pageSize   - Items per page
 * @param transform  - Optional row mapper applied to each data row
 */
export async function paginatedQuery<TRow, TOut>(
  input: PaginatedQueryInput<TRow> & { transform: (row: TRow) => TOut },
): Promise<PaginatedResult<TOut>>;
export async function paginatedQuery<TRow>(input: PaginatedQueryInput<TRow>): Promise<PaginatedResult<TRow>>;
export async function paginatedQuery<TRow, TOut>(
  input: PaginatedQueryInput<TRow> & { transform?: (row: TRow) => TOut },
): Promise<PaginatedResult<TRow | TOut>> {
  const offset = (input.page - 1) * input.pageSize;

  const [rows, countRows] = await Promise.all([input.dataQuery.limit(input.pageSize).offset(offset), input.countQuery]);

  const total = Number(countRows.at(0)?.total ?? 0);
  const transform: (row: TRow) => TRow | TOut = input.transform ?? ((row) => row);

  return {
    items: rows.map(transform),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: computeTotalPages(total, input.pageSize),
  };
}
