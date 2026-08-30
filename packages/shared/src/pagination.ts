export type PaginationMetadata = { page: number; pageSize: number; total: number; totalPages: number };

export type PaginatedResult<T> = PaginationMetadata & { items: T[] };

export type CursorPaginationMetadata = { nextCursor: string | null };

export type CursorPage<T> = CursorPaginationMetadata & { items: T[] };

export type SortDirection = 'asc' | 'desc';
