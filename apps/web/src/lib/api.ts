declare global {
  interface Window {
    api?: {
      getServerConfig: () => Promise<{ url: string }>;
      window?: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
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
