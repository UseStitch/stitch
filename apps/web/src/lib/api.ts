export type ContextMenuParams = {
  x: number;
  y: number;
  misspelledWord: string;
  dictionarySuggestions: string[];
  selectionText: string;
  isEditable: boolean;
  editFlags: {
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
};

declare global {
  interface Window {
    electron?: {
      platform: NodeJS.Platform;
      send: (channel: string, data?: unknown) => void;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
    };
    api?: {
      getServerConfig: () => Promise<{ url: string }>;
      window?: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
      };
      devtools?: {
        toggle: () => Promise<void>;
        inspect: (x: number, y: number) => Promise<void>;
      };
      shell?: {
        openExternal: (url: string) => Promise<void>;
      };
      files?: {
        writeTmp: (data: ArrayBuffer, ext: string) => Promise<string>;
        openPath: () => Promise<string[]>;
      };
      spellcheck?: {
        replaceMisspelling: (word: string) => Promise<void>;
        addToDictionary: (word: string) => Promise<void>;
      };
    };
  }
}

const DEV_FALLBACK_URL = 'http://localhost:3000';

let cachedUrl: string | null = null;

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
