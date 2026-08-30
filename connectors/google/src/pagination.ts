import { z } from 'zod';

export function paginationFields(maxResultsDescription = 'Max results to return (default 10)') {
  return {
    maxResults: z.number().int().min(1).max(100).optional().default(10).describe(maxResultsDescription),
    pageToken: z.string().min(1).optional().describe('Pagination token from a previous search'),
  };
}
