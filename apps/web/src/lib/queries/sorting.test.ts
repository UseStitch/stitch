import { describe, expect, test } from 'bun:test';

import { automationsPageQueryOptions, automationsSidebarListQueryOptions } from './automations';
import { recordingsQueryOptions } from './recordings';

describe('paginated sorting query keys', () => {
  test('isolates automation pages by sort field and direction', () => {
    const byTitle = automationsPageQueryOptions({ page: 1, pageSize: 15, sort: 'title', sortDirection: 'asc' });
    const byUpdated = automationsPageQueryOptions({ page: 1, pageSize: 15, sort: 'updatedAt', sortDirection: 'desc' });

    expect(byTitle.queryKey).not.toEqual(byUpdated.queryKey);
  });

  test('isolates recording pages by sort field and direction', () => {
    const ascending = recordingsQueryOptions({ page: 2, pageSize: 12, sort: 'costUsd', sortDirection: 'asc' });
    const descending = recordingsQueryOptions({ page: 2, pageSize: 12, sort: 'costUsd', sortDirection: 'desc' });

    expect(ascending.queryKey).not.toEqual(descending.queryKey);
  });

  test('continues the automation sidebar onto the next numbered page', () => {
    const { getNextPageParam } = automationsSidebarListQueryOptions;

    expect(getNextPageParam({ page: 2, pageSize: 50, total: 3, totalPages: 3, automations: [] }, [], 1, [])).toBe(3);
    expect(getNextPageParam({ page: 3, pageSize: 50, total: 3, totalPages: 3, automations: [] }, [], 1, [])).toBeUndefined();
  });
});
