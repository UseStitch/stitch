import fs from 'node:fs/promises';
import path from 'node:path';

import type { CDPClient } from '@/lib/browser/cdp-client.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'browser.watchdog.storage' });

type CookieEntry = Record<string, unknown>;

type StorageState = {
  cookies: CookieEntry[];
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

/**
 * Saves and loads browser storage state (cookies + localStorage) to/from
 * a JSON file. This lets the agent persist auth state across sessions
 * even when the user data dir doesn't carry over.
 *
 * Operates via CDP Network.getAllCookies / Network.setCookies and
 * Runtime.evaluate for localStorage.
 */
export class StorageStateManager {
  private session: CDPClient | null = null;
  private filePath: string | null = null;

  configure(options: { session: CDPClient; filePath?: string }): void {
    this.session = options.session;
    this.filePath = options.filePath ?? null;
  }

  detach(): void {
    this.session = null;
  }

  async save(overridePath?: string): Promise<string | null> {
    const session = this.session;
    const savePath = overridePath ?? this.filePath;
    if (!session || !savePath) return null;

    try {
      const [cookieResult, originsResult] = await Promise.all([
        session.send('Network.getAllCookies', {}),
        this.getLocalStorageOrigins(session),
      ]);

      const cookies = (cookieResult.cookies as CookieEntry[]) ?? [];
      const state: StorageState = { cookies, origins: originsResult };

      await fs.mkdir(path.dirname(savePath), { recursive: true });

      // Atomic write: write to temp then rename
      const tmpPath = `${savePath}.tmp`;
      await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
      await fs.rename(tmpPath, savePath);

      log.info(
        { path: savePath, cookies: cookies.length, origins: originsResult.length },
        'Storage state saved',
      );
      return savePath;
    } catch (error) {
      log.error({ error }, 'Failed to save storage state');
      return null;
    }
  }

  async load(overridePath?: string): Promise<boolean> {
    const session = this.session;
    const loadPath = overridePath ?? this.filePath;
    if (!session || !loadPath) return false;

    try {
      const content = await fs.readFile(loadPath, 'utf-8');
      const state = JSON.parse(content) as StorageState;

      // Restore cookies
      if (state.cookies?.length > 0) {
        // Normalize session cookies: remove expires=0/-1 which CDP treats as expired
        const normalized = state.cookies.map((c) => {
          const copy = { ...c };
          const expires = copy.expires as number | undefined;
          if (expires === 0 || expires === -1) {
            delete copy.expires;
          }
          return copy;
        });

        await session.send('Network.setCookies', { cookies: normalized });
        log.debug({ count: normalized.length }, 'Restored cookies');
      }

      // Restore localStorage via init scripts
      if (state.origins?.length > 0) {
        for (const origin of state.origins) {
          if (!origin.localStorage?.length) continue;

          const setStatements = origin.localStorage
            .map(
              (item) =>
                `localStorage.setItem(${JSON.stringify(item.name)}, ${JSON.stringify(item.value)});`,
            )
            .join('\n');

          const script = `
            (function() {
              if (window.location && window.location.origin !== ${JSON.stringify(origin.origin)}) return;
              try { ${setStatements} } catch(e) {}
            })();
          `;

          await session.send('Page.addScriptToEvaluateOnNewDocument', { source: script });
        }
        log.debug({ count: state.origins.length }, 'Restored localStorage origins');
      }

      log.info({ path: loadPath }, 'Storage state loaded');
      return true;
    } catch (error) {
      // File doesn't exist or can't parse — not fatal
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        log.error({ error }, 'Failed to load storage state');
      }
      return false;
    }
  }

  private async getLocalStorageOrigins(session: CDPClient): Promise<StorageState['origins']> {
    try {
      const result = await session.send('Runtime.evaluate', {
        expression: `
          (function() {
            try {
              const items = [];
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key !== null) {
                  items.push({ name: key, value: localStorage.getItem(key) || '' });
                }
              }
              return { origin: location.origin, localStorage: items };
            } catch(e) {
              return null;
            }
          })()
        `,
        returnByValue: true,
      });

      const value = (result.result as Record<string, unknown>)?.value;
      if (value && typeof value === 'object') {
        return [value as StorageState['origins'][number]];
      }
      return [];
    } catch {
      return [];
    }
  }
}
