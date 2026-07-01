import { getBrowserManager } from '@/lib/browser/browser-manager.js';

let queueTail: Promise<void> = Promise.resolve();

function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const previous = queueTail.catch(() => {});
  let release: () => void = () => {};
  queueTail = previous.then(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );

  return previous.then(async () => {
    try {
      return await fn();
    } finally {
      release();
    }
  });
}

export async function runBrowserTool<TInput>(
  input: TInput,
  execContext: { toolCallId: string; abortSignal?: AbortSignal },
  sessionId: string,
  execute: (signal?: AbortSignal) => Promise<unknown>,
): Promise<unknown> {
  return runSerialized(async () => {
    try {
      const browser = getBrowserManager(sessionId);
      await browser.launch();
      return await execute(execContext.abortSignal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });
}
