import type { GoogleClient } from '../client.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DOCS_API = 'https://docs.googleapis.com/v1';
const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';

type DriveDocumentRaw = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
};

type DriveListResponse = {
  files: DriveDocumentRaw[];
  nextPageToken?: string;
};

type DocsTextRun = {
  content?: string;
};

type DocsParagraphElement = {
  textRun?: DocsTextRun;
};

type DocsParagraph = {
  elements?: DocsParagraphElement[];
};

type DocsStructuralElement = {
  endIndex?: number;
  paragraph?: DocsParagraph;
  table?: {
    tableRows?: {
      tableCells?: {
        content?: DocsStructuralElement[];
      }[];
    }[];
  };
  tableOfContents?: {
    content?: DocsStructuralElement[];
  };
};

type DocsDocumentRaw = {
  documentId: string;
  title: string;
  body?: {
    content?: DocsStructuralElement[];
  };
};

type DocsSearchResult = {
  documents: {
    id: string;
    name: string;
    modifiedTime: string | undefined;
    webViewLink: string | undefined;
  }[];
  nextPageToken: string | undefined;
};

type DocsReadResult = {
  id: string;
  title: string;
  text: string;
  webViewLink: string;
};

function collectText(elements: DocsStructuralElement[] | undefined): string {
  if (!elements?.length) {
    return '';
  }

  let text = '';
  for (const element of elements) {
    if (element.paragraph?.elements) {
      for (const paragraphElement of element.paragraph.elements) {
        if (paragraphElement.textRun?.content) {
          text += paragraphElement.textRun.content;
        }
      }
    }

    if (element.table?.tableRows) {
      for (const row of element.table.tableRows) {
        for (const cell of row.tableCells ?? []) {
          text += collectText(cell.content);
        }
      }
    }

    if (element.tableOfContents?.content) {
      text += collectText(element.tableOfContents.content);
    }
  }

  return text;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getBodyEndIndex(document: DocsDocumentRaw): number {
  const content = document.body?.content;
  if (!content?.length) {
    return 1;
  }

  const last = content[content.length - 1];
  if (!last?.endIndex || last.endIndex <= 1) {
    return 1;
  }

  return last.endIndex;
}

export async function searchDocuments(
  client: GoogleClient,
  query?: string,
  maxResults = 10,
  pageToken?: string,
): Promise<DocsSearchResult> {
  const normalizedQuery = query?.trim();
  const docsFilter = `mimeType='${GOOGLE_DOC_MIME_TYPE}' and trashed=false`;
  const driveQuery = normalizedQuery ? `${docsFilter} and (${normalizedQuery})` : docsFilter;

  const params = new URLSearchParams({
    q: driveQuery,
    pageSize: String(maxResults),
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink),nextPageToken',
  });
  if (pageToken) {
    params.set('pageToken', pageToken);
  }

  const response = await client.request<DriveListResponse>(`${DRIVE_API}/files?${params.toString()}`);

  return {
    documents: response.files.map((file) => ({
      id: file.id,
      name: file.name,
      modifiedTime: file.modifiedTime,
      webViewLink: file.webViewLink,
    })),
    nextPageToken: response.nextPageToken,
  };
}

export async function readDocument(client: GoogleClient, documentId: string): Promise<DocsReadResult> {
  const doc = await client.request<DocsDocumentRaw>(`${DOCS_API}/documents/${documentId}`);
  const text = normalizeText(collectText(doc.body?.content));

  return {
    id: doc.documentId,
    title: doc.title,
    text,
    webViewLink: `https://docs.google.com/document/d/${doc.documentId}/edit`,
  };
}

export async function createDocument(
  client: GoogleClient,
  title: string,
  content?: string,
): Promise<{ id: string; title: string; webViewLink: string }> {
  const created = await client.request<{ documentId: string; title: string }>(`${DOCS_API}/documents`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

  const initialContent = content?.trim();
  if (initialContent) {
    await client.request(`${DOCS_API}/documents/${created.documentId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: initialContent,
            },
          },
        ],
      }),
    });
  }

  return {
    id: created.documentId,
    title: created.title,
    webViewLink: `https://docs.google.com/document/d/${created.documentId}/edit`,
  };
}

export async function updateDocument(
  client: GoogleClient,
  documentId: string,
  content: string,
  mode: 'replace' | 'append',
): Promise<{ id: string; title: string; webViewLink: string }> {
  const doc = await client.request<DocsDocumentRaw>(`${DOCS_API}/documents/${documentId}`);
  const bodyEndIndex = getBodyEndIndex(doc);
  const requests: Array<Record<string, unknown>> = [];

  if (mode === 'replace' && bodyEndIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: {
          startIndex: 1,
          endIndex: bodyEndIndex - 1,
        },
      },
    });
  }

  requests.push({
    insertText: {
      location: { index: mode === 'append' ? Math.max(1, bodyEndIndex - 1) : 1 },
      text: content,
    },
  });

  await client.request(`${DOCS_API}/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  });

  return {
    id: doc.documentId,
    title: doc.title,
    webViewLink: `https://docs.google.com/document/d/${doc.documentId}/edit`,
  };
}
