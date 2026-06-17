import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, RotateCwIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import type {
  ElectronBrowserDownload,
  ElectronBrowserState,
} from '@stitch/shared/browser/electron';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type BrowserPanelProps = {
  sessionId: string;
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

export function BrowserPanel({ sessionId, onClose }: BrowserPanelProps) {
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

  // When sessionId changes while panel is already open, switch sessions
  React.useEffect(() => {
    if (!sessionId || !window.api?.browser) return;
    void window.api.browser.switchSession(sessionId).then(setState);
  }, [sessionId]);

  const registerWebview = React.useCallback(() => {
    const webview = webviewRef.current;
    if (!webview || !window.api?.browser) return;
    void window.api.browser.registerWebview(webview.getWebContentsId(), sessionId).then(setState);
  }, [sessionId]);

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

  const controllerBadgeClass =
    state.controller === 'agent'
      ? 'bg-warning/20 text-warning'
      : state.controller === 'human'
        ? 'bg-success/20 text-success'
        : 'bg-muted text-muted-foreground';

  const controllerLabel =
    state.controller === 'agent' ? 'Agent' : state.controller === 'human' ? 'You' : 'Ready';

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background">
      {/* Tab strip */}
      <div className="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-muted/30 px-1">
        {state.tabs.length === 0 ? (
          <span className="px-2 text-xs text-muted-foreground">Starting...</span>
        ) : (
          state.tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                'group flex h-6 max-w-40 shrink-0 items-center rounded text-xs',
                tab.active
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60',
              )}
            >
              <button
                className="min-w-0 flex-1 truncate px-2 py-0.5 text-left"
                onClick={() => void window.api?.browser.focusTab(tab.id)}
                type="button"
                title={tab.url}
              >
                {tab.title || tab.url || 'New tab'}
              </button>
              <button
                className="mr-0.5 flex size-4 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:bg-muted hover:opacity-100!"
                onClick={() => void window.api?.browser.closeTab(tab.id)}
                type="button"
                aria-label="Close tab"
              >
                <XIcon className="size-2.5" />
              </button>
            </div>
          ))
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-0.5 shrink-0"
          onClick={() => void window.api?.browser.newTab()}
          aria-label="New tab"
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </div>

      {/* Nav bar */}
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void window.api?.browser.goBack()}
          aria-label="Back"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void window.api?.browser.goForward()}
          aria-label="Forward"
        >
          <ArrowRightIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void window.api?.browser.reload()}
          aria-label="Reload"
        >
          <RotateCwIcon className="size-4" />
        </Button>

        <form className="min-w-0 flex-1" onSubmit={submitAddress}>
          <input
            className="h-7 w-full rounded border border-border bg-muted/40 px-2 text-xs outline-none focus:border-primary"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </form>

        <span
          className={cn(
            'shrink-0 rounded px-2 py-0.5 text-[10px] font-medium',
            controllerBadgeClass,
          )}
        >
          {controllerLabel}
        </span>

        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close browser">
          <XIcon className="size-4" />
        </Button>
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
