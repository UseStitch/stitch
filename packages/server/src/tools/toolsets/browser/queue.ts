import { getBrowserManager } from '@/lib/browser/browser-manager.js';
import { ToolError } from '@/tools/errors.js';

let queueTail: Promise<unknown> = Promise.resolve();

function runSerialized<T>(fn: () => Promise<T>): Promise<T> {
  const r = queueTail.then(fn, fn);
  queueTail = r.catch(() => {});
  return r;
}

export async function runBrowserTool(
  abortSignal: AbortSignal | undefined,
  sessionId: string,
  execute: (signal?: AbortSignal) => Promise<unknown>,
): Promise<unknown> {
  return runSerialized(async () => {
    try {
      const browser = getBrowserManager(sessionId);
      await browser.launch();
      return await execute(abortSignal);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      const message = Error.isError(error) ? error.message : String(error);
      throw new ToolError(message);
    }
  });
}
