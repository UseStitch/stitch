import type { CDPClient } from '@/lib/browser/cdp-client.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'browser.watchdog.download' });

type DownloadEntry = {
  guid: string;
  url: string;
  suggestedFilename: string;
  state: 'inProgress' | 'completed' | 'canceled';
  receivedBytes: number;
  totalBytes: number;
};

/**
 * Tracks browser downloads via CDP Browser.downloadWillBegin / Browser.downloadProgress.
 * Reports completed files so the agent can reference them.
 *
 * Attach to the **browser-level** CDP client (not page sessions) since
 * download events are emitted at the browser scope.
 */
export class DownloadWatchdog {
  private client: CDPClient | null = null;
  private downloads = new Map<string, DownloadEntry>();

  async attach(client: CDPClient, downloadPath?: string): Promise<void> {
    if (this.client) return;
    this.client = client;

    // Enable download events. behavior=allowAndName saves files with
    // their GUID so they don't collide; we rename on completion if needed.
    try {
      await client.send('Browser.setDownloadBehavior', {
        behavior: 'allowAndName',
        ...(downloadPath ? { downloadPath } : {}),
        eventsEnabled: true,
      });
    } catch {
      // Fallback for older Chrome versions
      await client.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        ...(downloadPath ? { downloadPath } : {}),
      });
      log.debug('Download events not supported, using basic allow mode');
      return;
    }

    client.on('Browser.downloadWillBegin', this.onDownloadStart);
    client.on('Browser.downloadProgress', this.onDownloadProgress);
    log.debug('Download watchdog attached');
  }

  detach(): void {
    if (!this.client) return;
    this.client.off('Browser.downloadWillBegin', this.onDownloadStart);
    this.client.off('Browser.downloadProgress', this.onDownloadProgress);
    this.client = null;
  }

  getDownloads(): DownloadEntry[] {
    return [...this.downloads.values()];
  }

  getCompletedDownloads(): DownloadEntry[] {
    return [...this.downloads.values()].filter((d) => d.state === 'completed');
  }

  clear(): void {
    this.downloads.clear();
  }

  private onDownloadStart = (params: Record<string, unknown>): void => {
    const guid = params.guid as string;
    const url = params.url as string;
    const suggestedFilename = (params.suggestedFilename as string) || 'download';

    log.info({ guid, url, suggestedFilename }, 'Download started');

    this.downloads.set(guid, {
      guid,
      url,
      suggestedFilename,
      state: 'inProgress',
      receivedBytes: 0,
      totalBytes: 0,
    });
  };

  private onDownloadProgress = (params: Record<string, unknown>): void => {
    const guid = params.guid as string;
    const state = params.state as 'inProgress' | 'completed' | 'canceled';
    const receivedBytes = (params.receivedBytes as number) ?? 0;
    const totalBytes = (params.totalBytes as number) ?? 0;

    const entry = this.downloads.get(guid);
    if (!entry) return;

    entry.state = state;
    entry.receivedBytes = receivedBytes;
    entry.totalBytes = totalBytes;

    if (state === 'completed') {
      log.info(
        { guid, filename: entry.suggestedFilename, bytes: receivedBytes },
        'Download completed',
      );
    } else if (state === 'canceled') {
      log.info({ guid, filename: entry.suggestedFilename }, 'Download canceled');
    }
  };
}
