export async function serverJson<T>(
  serverUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${serverUrl}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Server request failed: ${path}`);
  }
  return res.json() as Promise<T>;
}
