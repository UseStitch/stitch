import type { GoogleClient } from '../client.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

type DriveFileRaw = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  webViewLink?: string;
  owners?: { displayName: string; emailAddress: string }[];
};

type DriveListResponse = {
  files: DriveFileRaw[];
  nextPageToken?: string;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size: string | undefined;
  createdTime: string | undefined;
  modifiedTime: string | undefined;
  webViewLink: string | undefined;
  owners: { displayName: string; emailAddress: string }[] | undefined;
};

type DriveSearchResult = {
  files: DriveFile[];
  nextPageToken: string | undefined;
};

type DriveFileContent = {
  id: string;
  name: string;
  mimeType: string;
  content: string;
};

function mapFile(raw: DriveFileRaw): DriveFile {
  return {
    id: raw.id,
    name: raw.name,
    mimeType: raw.mimeType,
    size: raw.size,
    createdTime: raw.createdTime,
    modifiedTime: raw.modifiedTime,
    webViewLink: raw.webViewLink,
    owners: raw.owners,
  };
}

export async function searchFiles(
  client: GoogleClient,
  query: string,
  maxResults = 10,
  pageToken?: string,
): Promise<DriveSearchResult> {
  const params = new URLSearchParams({
    q: query,
    pageSize: String(maxResults),
    fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink),nextPageToken',
  });
  if (pageToken) params.set('pageToken', pageToken);

  const response = await client.request<DriveListResponse>(
    `${DRIVE_API}/files?${params.toString()}`,
  );

  return {
    files: response.files.map(mapFile),
    nextPageToken: response.nextPageToken,
  };
}

export async function getFileMetadata(client: GoogleClient, fileId: string): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,size,createdTime,modifiedTime,webViewLink,parents,owners',
  });

  const raw = await client.request<DriveFileRaw>(
    `${DRIVE_API}/files/${fileId}?${params.toString()}`,
  );

  return mapFile(raw);
}

/** Google Workspace MIME types that can be exported as text. */
const EXPORT_MIME_MAP: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

export async function getFileContent(
  client: GoogleClient,
  fileId: string,
): Promise<DriveFileContent> {
  const meta = await getFileMetadata(client, fileId);

  const exportMime = EXPORT_MIME_MAP[meta.mimeType];

  let content: string;
  if (exportMime) {
    // Google Workspace files must be exported
    content = await client.requestText(
      `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
    );
  } else {
    // Binary/text files — download directly
    content = await client.requestText(`${DRIVE_API}/files/${fileId}?alt=media`);
  }

  return {
    id: meta.id,
    name: meta.name,
    mimeType: meta.mimeType,
    content,
  };
}

type DriveWriteResult = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string | undefined;
};

export async function createFile(
  client: GoogleClient,
  name: string,
  content: string,
  mimeType = 'text/plain',
  parentId?: string,
): Promise<DriveWriteResult> {
  const metadata: Record<string, unknown> = { name, mimeType };
  if (parentId) metadata['parents'] = [parentId];

  const metadataPart = JSON.stringify(metadata);
  const boundary = 'drive_upload_boundary';

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadataPart,
    `--${boundary}`,
    `Content-Type: ${mimeType}`,
    '',
    content,
    `--${boundary}--`,
  ].join('\r\n');

  const raw = await client.request<DriveFileRaw>(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );

  return {
    id: raw.id,
    name: raw.name,
    mimeType: raw.mimeType,
    webViewLink: raw.webViewLink,
  };
}
