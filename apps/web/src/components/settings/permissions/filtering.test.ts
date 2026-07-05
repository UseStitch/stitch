import { describe, expect, test } from 'bun:test';

import {
  filterCoreTools,
  filterToolsetsByQuery,
  type KnownToolSummary,
  type KnownToolsetSummary,
} from './filtering.js';

describe('tools settings filtering', () => {
  test('core tools filter matches by displayName and toolName', () => {
    const tools: KnownToolSummary[] = [
      { toolType: 'stitch', toolName: 'bash', displayName: 'Bash' },
      { toolType: 'stitch', toolName: 'webfetch', displayName: 'Web Fetch' },
      { toolType: 'mcp', toolName: 'mcp_server_search', displayName: 'Search' },
    ];

    expect(filterCoreTools(tools, 'bash').map((tool) => tool.toolName)).toEqual(['bash']);
    expect(filterCoreTools(tools, 'web fetch').map((tool) => tool.toolName)).toEqual(['webfetch']);
    expect(filterCoreTools(tools, 'search')).toEqual([]);
  });

  test('toolset filter matches toolset metadata and individual tools', () => {
    const toolsets: KnownToolsetSummary[] = [
      {
        id: 'agenda',
        name: 'Agenda',
        description: 'Manage tasks and lists',
        tools: [
          { toolName: 'agenda_add_item', displayName: 'Agenda Add Item' },
          { toolName: 'agenda_list_items', displayName: 'Agenda List Items' },
        ],
      },
      {
        id: 'google-calendar',
        name: 'Google Calendar',
        description: 'Manage calendar events',
        tools: [{ toolName: 'calendar_update', displayName: 'Calendar Update' }],
      },
    ];

    expect(filterToolsetsByQuery(toolsets, 'agenda').map((toolset) => toolset.id)).toEqual(['agenda']);
    expect(filterToolsetsByQuery(toolsets, 'events').map((toolset) => toolset.id)).toEqual(['google-calendar']);
    expect(filterToolsetsByQuery(toolsets, 'calendar_update').map((toolset) => toolset.id)).toEqual([
      'google-calendar',
    ]);
    expect(filterToolsetsByQuery(toolsets, 'add item').map((toolset) => toolset.id)).toEqual(['agenda']);
  });
});
