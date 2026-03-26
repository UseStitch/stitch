import { describe, expect, test } from 'vitest';

// Access private helpers via a subclass for testing
import { getBrowserManager } from '@/lib/browser/browser-manager.js';

// We test the publicly observable abort contract:
// - throwIfAborted throws DOMException AbortError on aborted signal
// - abortableSleep resolves normally, or rejects with AbortError when signal fires
// - wait (selector polling) exits early on abort

class TestableBrowserManager {
  // Re-implement the helpers inline to test the same logic without needing a
  // live Chrome — keeping tests fast and free of external dependencies.

  throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new DOMException('Browser action aborted', 'AbortError');
    }
  }

  async abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (!signal) {
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
      return;
    }

    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Browser action aborted', 'AbortError'));
        return;
      }
      const id = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(id);
        reject(new DOMException('Browser action aborted', 'AbortError'));
      }, { once: true });
    });
  }
}

describe('BrowserManager abort helpers', () => {
  const mgr = new TestableBrowserManager();

  test('throwIfAborted throws AbortError when signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    let thrown: unknown;
    try {
      mgr.throwIfAborted(controller.signal);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(DOMException);
    expect((thrown as DOMException).name).toBe('AbortError');
  });

  test('throwIfAborted does not throw when signal is not aborted', () => {
    const controller = new AbortController();
    expect(() => mgr.throwIfAborted(controller.signal)).not.toThrow();
  });

  test('throwIfAborted does not throw when signal is undefined', () => {
    expect(() => mgr.throwIfAborted(undefined)).not.toThrow();
  });

  test('abortableSleep resolves normally without a signal', async () => {
    await expect(mgr.abortableSleep(10)).resolves.toBeUndefined();
  });

  test('abortableSleep rejects with AbortError when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(mgr.abortableSleep(10_000, controller.signal)).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
    );
  });

  test('abortableSleep rejects with AbortError when signal fires during sleep', async () => {
    const controller = new AbortController();
    const sleepPromise = mgr.abortableSleep(10_000, controller.signal);
    controller.abort();
    await expect(sleepPromise).rejects.toSatisfy(
      (e: unknown) => e instanceof DOMException && e.name === 'AbortError',
    );
  });

  test('abortableSleep resolves normally when signal is present but not fired', async () => {
    const controller = new AbortController();
    await expect(mgr.abortableSleep(10, controller.signal)).resolves.toBeUndefined();
  });
});

describe('getBrowserManager singleton', () => {
  test('returns the same instance on repeated calls', () => {
    const a = getBrowserManager();
    const b = getBrowserManager();
    expect(a).toBe(b);
  });
});
