import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, RotateCwIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import type { ElectronBrowserDownload, ElectronBrowserState } from '@stitch/shared/browser/electron';

import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type BrowserPanelProps = { sessionId: string; onClose: () => void };

type WebviewElement = HTMLElement & { getWebContentsId: () => number; getURL: () => string };

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

  const submitAddress = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void window.api?.browser.userNavigate(address);
  };

  const controllerBadgeClass =
    state.controller === 'agent'
      ? 'bg-warning-subtle text-warning'
      : state.controller === 'human'
        ? 'bg-success-subtle text-success'
        : 'bg-muted text-muted-foreground';

  const controllerLabel = state.controller === 'agent' ? 'Agent' : state.controller === 'human' ? 'You' : 'Ready';

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border bg-background">
      {/* Tab strip */}
      <div className="flex h-8 shrink-0 items-center gap-space-2xs overflow-x-auto border-b border-border bg-surface-sunken px-space-xs">
        {state.tabs.length === 0 ? (
          <div className="px-space-m">
            <Text as="span" variant="caption" tone="muted">
              Starting...
            </Text>
          </div>
        ) : (
          state.tabs.map((tab) => (
            <div
              key={tab.id}
              className={cn(
                'group flex h-6 max-w-40 shrink-0 items-center rounded-sm text-xs',
                tab.active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent',
              )}>
              <Button
                variant="ghost"
                className="h-auto min-w-0 flex-1 justify-start truncate px-space-m py-space-2xs text-left font-normal hover:bg-transparent"
                onClick={() => void window.api?.browser.focusTab(tab.id)}
                type="button"
                title={tab.url}>
                {tab.title || tab.url || 'New tab'}
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                className="mr-space-2xs size-4 shrink-0 rounded-sm opacity-0 group-hover:opacity-60 hover:bg-muted hover:opacity-100!"
                onClick={() => void window.api?.browser.closeTab(tab.id)}
                type="button"
                aria-label="Close tab">
                <Icon as={XIcon} size="xs" />
              </Button>
            </div>
          ))
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-space-2xs shrink-0"
          onClick={() => void window.api?.browser.newTab()}
          aria-label="New tab">
          <Icon as={PlusIcon} size="s" />
        </Button>
      </div>

      {/* Nav bar */}
      <div className="flex h-9 shrink-0 items-center gap-space-xs border-b border-border px-space-m">
        <Button variant="ghost" size="icon-sm" onClick={() => void window.api?.browser.goBack()} aria-label="Back">
          <Icon as={ArrowLeftIcon} size="m" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void window.api?.browser.goForward()}
          aria-label="Forward">
          <Icon as={ArrowRightIcon} size="m" />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => void window.api?.browser.reload()} aria-label="Reload">
          <Icon as={RotateCwIcon} size="m" />
        </Button>

        <form className="min-w-0 flex-1" onSubmit={submitAddress}>
          <Input
            className="h-7 w-full rounded-sm border-border bg-surface-sunken px-space-m py-space-none text-xs focus:border-primary focus-visible:ring-0"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </form>

        <Badge variant="soft" size="xs" className={cn('shrink-0', controllerBadgeClass)}>
          {controllerLabel}
        </Badge>

        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close browser">
          <Icon as={XIcon} size="m" />
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
    <div className="max-h-36 shrink-0 overflow-y-auto border-t border-border bg-surface-sunken p-space-m">
      <div className="mb-space-xs text-xs font-medium">Downloads</div>
      <div className="space-y-space-xs">
        {downloads.slice(0, 5).map((download) => (
          <div className="flex items-center gap-space-m text-xs" key={download.id} title={download.path}>
            <div className="min-w-0 flex-1">
              <Text as="span" variant="caption" truncate>
                {download.filename}
              </Text>
            </div>
            <div className="shrink-0">
              <Text as="span" variant="caption" tone="muted">
                {formatDownloadState(download)}
              </Text>
            </div>
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
