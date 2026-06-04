import { ipcMain, type BrowserWindow } from 'electron';

import type { ServerConfigPayload, ServerTestRemoteResult } from '../ipc-types.js';
import { normalizeRemoteUrl, writeServerConnectionConfig, type ServerConnectionConfig } from '../server-config.js';
import { checkHealth } from '../sidecar.js';
import { stopRecordingCapture } from '../recording-capture.js';
import { killServer } from '../sidecar.js';

type ServerState = {
  serverUrl: string;
  serverConnectionConfig: ServerConnectionConfig;
};

type StartLocalServer = () => Promise<string>;

export function registerServerHandlers(
  state: ServerState,
  startLocalServer: StartLocalServer,
  getWindow: () => BrowserWindow | null,
): void {
  ipcMain.handle('get-server-config', (): ServerConfigPayload => ({
    url: state.serverUrl,
    mode: state.serverConnectionConfig.mode,
    remoteUrl: state.serverConnectionConfig.remoteUrl,
  }));

  ipcMain.handle(
    'server:test-remote',
    async (_event, rawUrl: string): Promise<ServerTestRemoteResult> => {
      try {
        const url = normalizeRemoteUrl(rawUrl);
        const ok = await checkHealth(url);
        return ok ? { ok: true, url } : { ok: false, error: 'Server health check failed' };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Invalid server URL',
        };
      }
    },
  );

  ipcMain.handle(
    'server:set-config',
    async (_event, config: ServerConnectionConfig): Promise<ServerConfigPayload> => {
      let nextConfig: ServerConnectionConfig;

      if (config.mode === 'remote') {
        const remoteUrl = normalizeRemoteUrl(config.remoteUrl ?? '');
        if (!(await checkHealth(remoteUrl))) {
          throw new Error('Remote server health check failed');
        }
        nextConfig = { mode: 'remote', remoteUrl };
      } else {
        nextConfig = { mode: 'local', remoteUrl: config.remoteUrl?.trim() || null };
      }

      await stopRecordingCapture().catch(() => null);
      await killServer();

      const nextUrl =
        nextConfig.mode === 'remote' ? nextConfig.remoteUrl! : await startLocalServer();

      state.serverUrl = nextUrl;
      state.serverConnectionConfig = nextConfig;
      await writeServerConnectionConfig(nextConfig);

      const payload: ServerConfigPayload = {
        url: state.serverUrl,
        mode: state.serverConnectionConfig.mode,
        remoteUrl: state.serverConnectionConfig.remoteUrl,
      };

      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('server:config-changed', payload);
      }

      return payload;
    },
  );
}
