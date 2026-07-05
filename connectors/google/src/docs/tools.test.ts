import { describe, expect, test } from 'bun:test';

import { createDocsTools } from './tools.js';

import type { GoogleClient } from '../client.js';

type ExecutableTool = { execute: (input: unknown) => Promise<unknown> };

function getToolExecutor(tools: Record<string, unknown>, name: string): ExecutableTool {
  const candidate = tools[name];
  if (!candidate || typeof candidate !== 'object' || !('execute' in candidate)) {
    throw new Error(`Missing execute for tool: ${name}`);
  }

  return candidate as ExecutableTool;
}

function createDocsDocument(documentId: string, title: string, text: string) {
  return {
    documentId,
    title,
    body: { content: [{ endIndex: text.length + 1, paragraph: { elements: [{ textRun: { content: text } }] } }] },
  };
}

function createDocsClient(documentId: string, title: string, text: string) {
  const batchUpdates: unknown[] = [];
  const client = {
    request: async (url: string, options?: { body?: string }) => {
      if (url === `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`) {
        batchUpdates.push(JSON.parse(options?.body ?? '{}'));
        return {};
      }

      if (url === `https://docs.googleapis.com/v1/documents/${documentId}`) {
        return createDocsDocument(documentId, title, text);
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
  } as unknown as GoogleClient;

  const resolveClient: Parameters<typeof createDocsTools>[0] = async () => ({
    client,
    usedAccount: 'personal@gmail.com',
  });

  return { batchUpdates, resolveClient };
}

describe('createDocsTools docs_edit', () => {
  test('edits the first matching string by default', async () => {
    const { batchUpdates, resolveClient } = createDocsClient('doc-1', 'Roadmap', 'alpha beta alpha');
    const tools = createDocsTools(resolveClient, true);
    const docsEdit = getToolExecutor(tools, 'docs_edit');
    const result = await docsEdit.execute({ documentId: 'doc-1', oldString: 'beta', newString: 'gamma' });

    expect(batchUpdates).toHaveLength(1);
    expect(batchUpdates[0]).toEqual(
      expect.objectContaining({
        requests: expect.arrayContaining([
          expect.objectContaining({ insertText: { location: { index: 1 }, text: 'alpha gamma alpha' } }),
        ]),
      }),
    );
    expect(result).toEqual({
      id: 'doc-1',
      title: 'Roadmap',
      webViewLink: 'https://docs.google.com/document/d/doc-1/edit',
      usedAccount: 'personal@gmail.com',
    });
  });

  test('throws when oldString does not exist in the document', async () => {
    const { batchUpdates, resolveClient } = createDocsClient('doc-2', 'Notes', 'hello world');
    const tools = createDocsTools(resolveClient, true);
    const docsEdit = getToolExecutor(tools, 'docs_edit');

    expect(docsEdit.execute({ documentId: 'doc-2', oldString: 'missing', newString: 'found' })).rejects.toThrow(
      'oldString not found in content',
    );
    expect(batchUpdates).toHaveLength(0);
  });

  test('throws when oldString has multiple matches and replaceAll is false', async () => {
    const { batchUpdates, resolveClient } = createDocsClient('doc-3', 'Draft', 'repeat this repeat this');
    const tools = createDocsTools(resolveClient, true);
    const docsEdit = getToolExecutor(tools, 'docs_edit');

    expect(docsEdit.execute({ documentId: 'doc-3', oldString: 'repeat', newString: 'replace' })).rejects.toThrow(
      'Found multiple matches for oldString',
    );
    expect(batchUpdates).toHaveLength(0);
  });

  test('replaces all matches when replaceAll is true', async () => {
    const { batchUpdates, resolveClient } = createDocsClient('doc-4', 'Checklist', 'task task done');
    const tools = createDocsTools(resolveClient, true);
    const docsEdit = getToolExecutor(tools, 'docs_edit');

    await docsEdit.execute({ documentId: 'doc-4', oldString: 'task', newString: 'item', replaceAll: true });

    expect(batchUpdates).toHaveLength(1);
    expect(batchUpdates[0]).toEqual(
      expect.objectContaining({
        requests: expect.arrayContaining([
          expect.objectContaining({ insertText: { location: { index: 1 }, text: 'item item done' } }),
        ]),
      }),
    );
  });
});
