import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDocsTools } from '../docs/tools.js';

import type { GoogleClient } from '../client.js';

const { readDocumentMock, updateDocumentMock } = vi.hoisted(() => ({
  readDocumentMock: vi.fn(),
  updateDocumentMock: vi.fn(),
}));

vi.mock('../docs/api.js', () => ({
  readDocument: readDocumentMock,
  updateDocument: updateDocumentMock,
}));

type ExecutableTool = {
  execute: (input: unknown) => Promise<unknown>;
};

function getToolExecutor(tools: Record<string, unknown>, name: string): ExecutableTool {
  const candidate = tools[name];
  if (!candidate || typeof candidate !== 'object' || !('execute' in candidate)) {
    throw new Error(`Missing execute for tool: ${name}`);
  }

  return candidate as ExecutableTool;
}

describe('createDocsTools docs_edit', () => {
  const client = { request: vi.fn() } as unknown as GoogleClient;

  const resolveClient: Parameters<typeof createDocsTools>[0] = async () => ({
    client,
    usedAccount: 'personal@gmail.com',
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('edits the first matching string by default', async () => {
    readDocumentMock.mockResolvedValue({
      id: 'doc-1',
      title: 'Roadmap',
      text: 'alpha beta alpha',
      webViewLink: 'https://docs.google.com/document/d/doc-1/edit',
    });
    updateDocumentMock.mockResolvedValue({
      id: 'doc-1',
      title: 'Roadmap',
      webViewLink: 'https://docs.google.com/document/d/doc-1/edit',
    });

    const tools = createDocsTools(resolveClient, true);
    const docsEdit = getToolExecutor(tools, 'docs_edit');
    const result = await docsEdit.execute({
      documentId: 'doc-1',
      oldString: 'beta',
      newString: 'gamma',
    });

    expect(readDocumentMock).toHaveBeenCalledWith(client, 'doc-1');
    expect(updateDocumentMock).toHaveBeenCalledWith(client, 'doc-1', 'alpha gamma alpha', 'replace');
    expect(result).toEqual({
      id: 'doc-1',
      title: 'Roadmap',
      webViewLink: 'https://docs.google.com/document/d/doc-1/edit',
      usedAccount: 'personal@gmail.com',
    });
  });

  it('throws when oldString does not exist in the document', async () => {
    readDocumentMock.mockResolvedValue({
      id: 'doc-2',
      title: 'Notes',
      text: 'hello world',
      webViewLink: 'https://docs.google.com/document/d/doc-2/edit',
    });

    const tools = createDocsTools(resolveClient, true);
    const docsEdit = getToolExecutor(tools, 'docs_edit');

    await expect(
      docsEdit.execute({
        documentId: 'doc-2',
        oldString: 'missing',
        newString: 'found',
      }),
    ).rejects.toThrow('oldString not found in content');
    expect(updateDocumentMock).not.toHaveBeenCalled();
  });

  it('throws when oldString has multiple matches and replaceAll is false', async () => {
    readDocumentMock.mockResolvedValue({
      id: 'doc-3',
      title: 'Draft',
      text: 'repeat this repeat this',
      webViewLink: 'https://docs.google.com/document/d/doc-3/edit',
    });

    const tools = createDocsTools(resolveClient, true);
    const docsEdit = getToolExecutor(tools, 'docs_edit');

    await expect(
      docsEdit.execute({
        documentId: 'doc-3',
        oldString: 'repeat',
        newString: 'replace',
      }),
    ).rejects.toThrow('Found multiple matches for oldString');
    expect(updateDocumentMock).not.toHaveBeenCalled();
  });

  it('replaces all matches when replaceAll is true', async () => {
    readDocumentMock.mockResolvedValue({
      id: 'doc-4',
      title: 'Checklist',
      text: 'task task done',
      webViewLink: 'https://docs.google.com/document/d/doc-4/edit',
    });
    updateDocumentMock.mockResolvedValue({
      id: 'doc-4',
      title: 'Checklist',
      webViewLink: 'https://docs.google.com/document/d/doc-4/edit',
    });

    const tools = createDocsTools(resolveClient, true);
    const docsEdit = getToolExecutor(tools, 'docs_edit');

    await docsEdit.execute({
      documentId: 'doc-4',
      oldString: 'task',
      newString: 'item',
      replaceAll: true,
    });

    expect(updateDocumentMock).toHaveBeenCalledWith(client, 'doc-4', 'item item done', 'replace');
  });
});
