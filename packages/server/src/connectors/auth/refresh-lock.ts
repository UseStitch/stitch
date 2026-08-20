const DEFAULT_TIMEOUT_MS = 30_000;

const refreshInFlight = new Map<string, Promise<unknown>>();

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`OAuth token refresh timed out after ${DEFAULT_TIMEOUT_MS}ms`));
    }, DEFAULT_TIMEOUT_MS);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function withRefreshLock<T>(instanceId: string, refresh: () => Promise<T>): Promise<T> {
  const inFlight = refreshInFlight.get(instanceId) as Promise<T> | undefined;
  if (inFlight) return inFlight;

  const promise = withTimeout(refresh()).finally(() => {
    refreshInFlight.delete(instanceId);
  });

  refreshInFlight.set(instanceId, promise);
  return promise;
}
