import { cn } from 'cnfast';
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon, RotateCwIcon, XIcon } from 'lucide-react';
import * as React from 'react';

import type { ElectronBrowserDownload, ElectronBrowserState } from '@stitch/shared/browser/electron';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
    void window.api.browser.getState().then(setState);
    return window.api.browser.onStateChanged((next) => {
      setState(next);
      const active = next.tabs.find((tab) => tab.active);
      if (active) setAddress(active.url || 'about:blank');
    });
  }, []);

  // When sessionId changes while panel is already open, switch sessions
  React.useEffect(() => {
    if (!sessionId) return;
    void window.api.browser.switchSession(sessionId).then(setState);
  }, [sessionId]);

  const registerWebview = React.useCallback(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    void window.api.browser.registerWebview(webview.getWebContentsId(), sessionId).then(setState);
  }, [sessionId]);

  React.useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    const recordHumanInput = () => void window.api.browser.recordHumanInput();
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

  const submitAddress = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void window.api.browser.userNavigate(address);
  };

  const controllerBadgeClass =
    state.controller === 'agent'
      ? 'bg-warning-subtle text-warning'
      : state.controller === 'human'
        ? 'bg-success-subtle text-success'
        : 'bg-muted text-muted-foreground';

  const controllerLabel = state.controller === 'agent' ? 'Agent' : state.controller === 'human' ? 'You' : 'Ready';

  return (
    <div className="h-full min-h-0 border-l border-border bg-background">
      <Stack as="section" height="full" overflow="hidden">
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
                  'group flex h-6 max-w-40 shrink-0 items-center rounded-sm',
                  tab.active ? 'bg-background shadow-sm' : 'hover:bg-accent',
                )}>
                <Button
                  variant="ghost"
                  size="inline"
                  align="start"
                  className="min-w-0 flex-1 truncate"
                  onClick={() => void window.api.browser.focusTab(tab.id)}
                  type="button"
                  title={tab.url}>
                  <Text as="span" variant="caption" tone={tab.active ? 'default' : 'muted'} truncate>
                    {tab.title || tab.url || 'New tab'}
                  </Text>
                </Button>
                <span className="mr-space-2xs shrink-0 opacity-0 group-hover:opacity-60 hover:opacity-100!">
                  <Button
                    variant="ghost"
                    size="inline"
                    onClick={() => void window.api.browser.closeTab(tab.id)}
                    type="button"
                    aria-label="Close tab">
                    <Icon as={XIcon} size="xs" />
                  </Button>
                </span>
              </div>
            ))
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-space-2xs shrink-0"
            onClick={() => void window.api.browser.newTab()}
            aria-label="New tab">
            <Icon as={PlusIcon} size="s" />
          </Button>
        </div>

        {/* Nav bar */}
        <div className="flex h-9 shrink-0 items-center gap-space-xs border-b border-border px-space-m">
          <Button variant="ghost" size="icon-sm" onClick={() => void window.api.browser.goBack()} aria-label="Back">
            <Icon as={ArrowLeftIcon} size="m" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void window.api.browser.goForward()}
            aria-label="Forward">
            <Icon as={ArrowRightIcon} size="m" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => void window.api.browser.reload()} aria-label="Reload">
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
      </Stack>
    </div>
  );
}

function DownloadsPanel({ downloads }: { downloads: ElectronBrowserDownload[] }) {
  if (downloads.length === 0) return null;

  return (
    <div className="max-h-36 shrink-0 overflow-y-auto border-t border-border bg-surface-sunken p-space-m">
      <Text as="div" variant="label">
        Downloads
      </Text>
      <div className="space-y-space-xs">
        {downloads.slice(0, 5).map((download) => (
          <Stack direction="row" align="center" gap="m" key={download.id} title={download.path}>
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
          </Stack>
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
