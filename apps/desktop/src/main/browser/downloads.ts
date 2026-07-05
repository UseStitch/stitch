import { app, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import type { ElectronBrowserDownload } from '@stitch/shared/browser/electron';

export class DownloadTracker {
  private downloads = new Map<string, ElectronBrowserDownload>();

  constructor(private readonly broadcast: () => void) {}

  list(): ElectronBrowserDownload[] {
    return Array.from(this.downloads.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  handleDownload(item: Electron.DownloadItem): void {
    const downloadsDir = join(app.getPath('home'), '.stitch', 'downloads');
    mkdirSync(downloadsDir, { recursive: true });
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const targetPath = join(downloadsDir, basename(item.getFilename()));
    item.setSavePath(targetPath);
    const update = (state: ElectronBrowserDownload['state']) => {
      this.downloads.set(id, {
        id,
        filename: item.getFilename(),
        path: targetPath,
        url: item.getURL(),
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state,
        createdAt: Date.now(),
      });
      this.broadcast();
    };
    update('progressing');
    item.on('updated', (_event, state) => update(state === 'interrupted' ? 'interrupted' : 'progressing'));
    item.once('done', (_event, state) => update(state));
  }

  openDownload(download: ElectronBrowserDownload): void {
    void shell.openPath(download.path);
  }
}
