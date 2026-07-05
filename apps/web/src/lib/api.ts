import type { DesktopApi } from '../../../desktop/src/preload/index';

export type ContextMenuParams = {
  x: number;
  y: number;
  misspelledWord: string;
  dictionarySuggestions: string[];
  selectionText: string;
  isEditable: boolean;
  editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean };
};

export type DesktopUpdaterStatus =
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
    electron?: {
      platform: NodeJS.Platform;
      send: (channel: string, data?: unknown) => void;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
    };
    api?: DesktopApi;
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

export async function serverRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await serverFetch(path, init);
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
