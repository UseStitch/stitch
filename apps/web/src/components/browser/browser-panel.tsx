import * as React from 'react';

import type { ElectronBrowserDownload, ElectronBrowserState } from '@stitch/shared/browser/electron';

type BrowserPanelProps = {
  onClose: () => void;
};

type WebviewElement = HTMLElement & {
  getWebContentsId: () => number;
  getURL: () => string;
};

const DEFAULT_STATE: ElectronBrowserState = {
  tabs: [],
  activeTabId: null,
  visible: false,
  controller: 'none',
  downloads: [],
};

function getStandardChromeUserAgent(): string {
  return navigator.userAgent
    .replace(/\sElectron\/[^\s]+/g, '')
    .replace(/\sStitch\/[^\s]+/g, '')
    .trim();
}

export function BrowserPanel({ onClose }: BrowserPanelProps) {
  const webviewRef = React.useRef<WebviewElement | null>(null);
  const [state, setState] = React.useState<ElectronBrowserState>(DEFAULT_STATE);
  const [address, setAddress] = React.useState('about:blank');

  React.useEffect(() => {
    void window.api?.browser.getState().then(setState);
    return window.api?.browser.onStateChanged((next) => {
      setState(next);
      const active = next.tabs.find((tab) => tab.active);
      if (active) setAddress(active.url || 'about:blank');
    });
  }, []);

  const registerWebview = React.useCallback(() => {
    const webview = webviewRef.current;
    if (!webview || !window.api?.browser) return;
    void window.api.browser.registerWebview(webview.getWebContentsId()).then(setState);
  }, []);

  React.useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    const recordHumanInput = () => void window.api?.browser.recordHumanInput();
    const updateAddress = () => setAddress(webview.getURL());

    webview.addEventListener('dom-ready', registerWebview);
    webview.addEventListener('did-navigate', updateAddress);
    webview.addEventListener('did-navigate-in-page', updateAddress);
    webview.addEventListener('mousedown', recordHumanInput);
    webview.addEventListener('keydown', recordHumanInput);
    webview.addEventListener('wheel', recordHumanInput);

    return () => {
      webview.removeEventListener('dom-ready', registerWebview);
      webview.removeEventListener('did-navigate', updateAddress);
      webview.removeEventListener('did-navigate-in-page', updateAddress);
      webview.removeEventListener('mousedown', recordHumanInput);
      webview.removeEventListener('keydown', recordHumanInput);
      webview.removeEventListener('wheel', recordHumanInput);
    };
  }, [registerWebview]);

  const submitAddress = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void window.api?.browser.userNavigate(address);
    },
    [address],
  );

  const controllerLabel =
    state.controller === 'agent'
      ? 'Agent controlling'
      : state.controller === 'human'
        ? "You're in control"
        : 'Ready';

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <button className="rounded px-2 py-1 text-xs hover:bg-muted" onClick={() => void window.api?.browser.goBack()} type="button">
          Back
        </button>
        <button className="rounded px-2 py-1 text-xs hover:bg-muted" onClick={() => void window.api?.browser.goForward()} type="button">
          Forward
        </button>
        <button className="rounded px-2 py-1 text-xs hover:bg-muted" onClick={() => void window.api?.browser.reload()} type="button">
          Reload
        </button>
        <form className="min-w-0 flex-1" onSubmit={submitAddress}>
          <input
            className="h-7 w-full rounded border border-border bg-muted/40 px-2 text-xs outline-none focus:border-primary"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </form>
        <span className="shrink-0 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
          {controllerLabel}
        </span>
        <button className="rounded px-2 py-1 text-xs hover:bg-muted" onClick={onClose} type="button">
          Close
        </button>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-2">
        {state.tabs.length === 0 ? (
          <span className="text-xs text-muted-foreground">Browser starting...</span>
        ) : (
          state.tabs.map((tab) => (
            <button
              className={`max-w-48 truncate rounded px-2 py-1 text-xs ${tab.active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'}`}
              key={tab.id}
              onClick={() => void window.api?.browser.focusTab(tab.id)}
              type="button"
              title={tab.url}
            >
              {tab.title || tab.url || 'New tab'}
            </button>
          ))
        )}
        <button className="rounded px-2 py-1 text-xs hover:bg-muted" onClick={() => void window.api?.browser.newTab()} type="button">
          +
        </button>
      </div>

      <webview
        ref={(node) => {
          webviewRef.current = node as WebviewElement | null;
        }}
        className="min-h-0 flex-1"
        src="about:blank"
        partition="persist:stitch-browser"
        useragent={getStandardChromeUserAgent()}
      />

      <DownloadsPanel downloads={state.downloads} />
    </section>
  );
}

function DownloadsPanel({ downloads }: { downloads: ElectronBrowserDownload[] }) {
  if (downloads.length === 0) return null;

  return (
    <div className="max-h-36 shrink-0 overflow-y-auto border-t border-border bg-muted/20 p-2">
      <div className="mb-1 text-xs font-medium">Downloads</div>
      <div className="space-y-1">
        {downloads.slice(0, 5).map((download) => (
          <div className="flex items-center gap-2 text-xs" key={download.id} title={download.path}>
            <span className="min-w-0 flex-1 truncate">{download.filename}</span>
            <span className="shrink-0 text-muted-foreground">{formatDownloadState(download)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDownloadState(download: ElectronBrowserDownload): string {
  if (download.state !== 'progressing') return download.state;
  if (download.totalBytes <= 0) return 'downloading';
  return `${Math.round((download.receivedBytes / download.totalBytes) * 100)}%`;
}
