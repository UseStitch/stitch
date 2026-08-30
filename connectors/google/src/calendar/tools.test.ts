import { describe, expect, test } from 'bun:test';

import { StubGoogleClient } from '../test-helpers.js';
import { createCalendarTools } from './tools.js';

type ExecutableTool = { execute: (input: Record<string, unknown>) => Promise<unknown> };

function getToolExecutor(tools: ReturnType<typeof createCalendarTools>, name: string): ExecutableTool {
  const tool = tools[name] as { execute?: ExecutableTool['execute'] } | undefined;
  if (!tool || typeof tool.execute !== 'function') {
    throw new Error(`Missing execute for tool: ${name}`);
  }

  return tool as ExecutableTool;
}

describe('createCalendarTools calendar_list', () => {
  test('forwards pageToken and returns the continuation token', async () => {
    let requestedUrl: string | undefined;
    const client = new StubGoogleClient({
      request: async (url) => {
        requestedUrl = url;
        return { items: [], nextPageToken: 'next-page' };
      },
    });
    const tools = createCalendarTools(async () => ({ client, usedAccount: 'personal@gmail.com' }), false);

    const result = await getToolExecutor(tools, 'calendar_list').execute({ pageToken: 'current-page' });

    if (!requestedUrl) throw new Error('Calendar request was not made');
    expect(new URL(requestedUrl).searchParams.get('pageToken')).toBe('current-page');
    expect(result).toEqual({ events: [], nextPageToken: 'next-page', usedAccount: 'personal@gmail.com' });
  });
});
