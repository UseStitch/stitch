import type { DesktopBridge, ElectronBridge } from '@stitch/shared/desktop/bridge';

export type ContextMenuParams = {
  x: number;
  y: number;
  misspelledWord: string;
  dictionarySuggestions: string[];
  selectionText: string;
  isEditable: boolean;
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
};

type DesktopUpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'no-update'
  | 'error';

export type DesktopUpdaterState = { status: DesktopUpdaterStatus; version?: string; progress?: number; error?: string };

export type ServerMode = 'local' | 'remote';

export type ServerConnectionConfig = { url: string; mode: ServerMode; remoteUrl: string | null };

declare global {
  interface Window {
    electron?: ElectronBridge;
    api?: DesktopBridge;
  }
}

const DEV_FALLBACK_URL = 'http://localhost:3000';

let cachedUrl: string | null = null;

export function getServerUrlSync(): string | null {
  return cachedUrl;
}

export function resetServerUrlCache(url?: string): void {
  cachedUrl = url ?? null;
}

export async function getServerUrl(): Promise<string> {
  if (cachedUrl) return cachedUrl;

  if (window.api?.getServerConfig) {
    const config = await window.api.getServerConfig();
    cachedUrl = config.url;
    return cachedUrl;
  }

  cachedUrl = DEV_FALLBACK_URL;
  return cachedUrl;
}

export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = await getServerUrl();
  return fetch(`${baseUrl}${path}`, init);
}

type QueryParams = Record<string, string | number | undefined>;

export function toQueryString(params: QueryParams): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export async function serverRequest<T>(path: string, init?: RequestInit & { params?: QueryParams }): Promise<T> {
  const { params, ...requestInit } = init ?? {};
  const res = await serverFetch(params ? `${path}${toQueryString(params)}` : path, requestInit);
  if (!res.ok) {
    let errorMsg = `Request failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error) {
        errorMsg = errJson.error;
      }
    } catch {
      // JSON parsing failed; use status code fallback
    }
    throw new Error(errorMsg);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
