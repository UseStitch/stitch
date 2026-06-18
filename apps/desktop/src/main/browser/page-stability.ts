import type { WebContents } from 'electron';

const LOAD_TIMEOUT_MS = 15_000;
const PAGE_STABILITY_IDLE_MS = 500;
const PAGE_STABILITY_POLL_MS = 100;

export async function waitForPageStability(
  browser: WebContents,
  timeoutMs = LOAD_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  await waitForLoadIdle(browser, deadline);
  await waitForDocumentReady(browser, deadline);
  await waitForNetworkIdle(browser, deadline);
  await waitForDomIdle(browser, deadline);
}

function isHttpPage(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

export async function waitForNonEmptyHttpPage(
  browser: WebContents,
  isEmpty: () => Promise<boolean>,
  timeoutMs = LOAD_TIMEOUT_MS,
): Promise<void> {
  if (!isHttpPage(browser.getURL()) || !(await isEmpty())) return;

  await waitForPageStability(browser, timeoutMs);
  if (!(await isEmpty())) return;

  browser.reload();
  await waitForPageStability(browser, timeoutMs);
}

async function waitForLoadIdle(browser: WebContents, deadline: number): Promise<void> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new Error('Timed out waiting for page stability.');

  await new Promise<void>((resolve, reject) => {
    let idleTimer: NodeJS.Timeout | null = null;
    const timeoutTimer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for page stability.'));
    }, remainingMs);

    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      clearTimeout(timeoutTimer);
      browser.off('did-start-loading', onStartLoading);
      browser.off('did-stop-loading', onStopLoading);
      browser.off('did-fail-load', onStopLoading);
    };

    const finishAfterIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        cleanup();
        resolve();
      }, PAGE_STABILITY_IDLE_MS);
    };

    const onStopLoading = () => finishAfterIdle();

    const onStartLoading = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (!browser.isLoading()) finishAfterIdle();
    };

    browser.on('did-start-loading', onStartLoading);
    browser.on('did-stop-loading', onStopLoading);
    browser.on('did-fail-load', onStopLoading);

    if (browser.isLoading()) return;
    finishAfterIdle();
  });
}

async function waitForDocumentReady(browser: WebContents, deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    const ready = await browser.executeJavaScript('document.readyState !== "loading"', true);
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, PAGE_STABILITY_POLL_MS));
  }
  throw new Error('Timed out waiting for document readiness.');
}

async function waitForNetworkIdle(browser: WebContents, deadline: number): Promise<void> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new Error('Timed out waiting for network idle.');

  const script = `new Promise((resolve) => {
    let idleTimer = null;
    const timeoutTimer = setTimeout(finish, ${remainingMs});
    const observer = new PerformanceObserver(reset);

    function finish() {
      if (idleTimer) clearTimeout(idleTimer);
      clearTimeout(timeoutTimer);
      observer.disconnect();
      resolve(true);
    }

    function reset() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, ${PAGE_STABILITY_IDLE_MS});
    }

    try {
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      finish();
      return;
    }
    reset();
  })`;

  await browser.executeJavaScript(script, true);
}

async function waitForDomIdle(browser: WebContents, deadline: number): Promise<void> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) throw new Error('Timed out waiting for page stability.');

  const script = `new Promise((resolve) => {
    let idleTimer = null;
    const timeoutTimer = setTimeout(finish, ${remainingMs});
    const observer = new MutationObserver(reset);

    function finish() {
      if (idleTimer) clearTimeout(idleTimer);
      clearTimeout(timeoutTimer);
      observer.disconnect();
      resolve(true);
    }

    function reset() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, ${PAGE_STABILITY_IDLE_MS});
    }

    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
      characterData: true,
    });
    reset();
  })`;

  await browser.executeJavaScript(script, true);
}
