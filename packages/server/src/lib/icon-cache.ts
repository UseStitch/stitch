import fs from 'node:fs/promises';
import path from 'node:path';

export const ICON_CACHE_CONTROL = 'public, max-age=86400';
export const SVG_CONTENT_TYPE = 'image/svg+xml; charset=utf-8';

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function readCachedText(filePath: string): Promise<string | undefined> {
  return fs.readFile(filePath, 'utf8').catch(() => undefined);
}

export async function writeCachedText(filePath: string, value: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, 'utf8');
}

export function isSvgResponse(response: Response): boolean {
  return (
    response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() === 'image/svg+xml'
  );
}
