import { z } from 'zod';

export async function serverJson<T>(
  serverUrl: string,
  path: string,
  schema: z.ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${serverUrl}${path}`, init);
  if (!res.ok) {
    const body = z.object({ error: z.string().optional() }).parse(await res.json().catch(() => ({})));
    throw new Error(body.error ?? `Server request failed: ${path}`);
  }
  return schema.parse(await res.json());
}
