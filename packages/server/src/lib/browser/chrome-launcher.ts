import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import { findChrome } from '@/lib/browser/chrome-finder.js';
import type { BrowserVersionInfo } from '@/lib/browser/types.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'browser.launcher' });

const SIGKILL_TIMEOUT_MS = 200;
const MAX_POLL_ATTEMPTS = 50;
const POLL_INTERVAL_MS = 200;

type ChromeInstance = {
  process: ChildProcess;
  wsEndpoint: string;
  port: number;
};

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not determine port')));
      }
    });
  });
}

function buildChromeArgs(options: {
  port: number;
  userDataDir: string;
  headless: boolean;
  width: number;
  height: number;
}): string[] {
  const args = [
    `--remote-debugging-port=${options.port}`,
    `--user-data-dir=${options.userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--mute-audio',
    `--window-size=${options.width},${options.height}`,
    // Chrome >= 136 blocks --remote-debugging-port on real/copied user data dirs.
    // This flag bypasses that restriction so copied profiles work with CDP.
    '--disable-features=DevToolsDebuggingRestrictions',
  ];

  if (options.headless) {
    args.push('--headless=new');
  }

  return args;
}

async function pollForDevToolsEndpoint(port: number): Promise<string> {
  const url = `http://127.0.0.1:${port}/json/version`;

  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const info = (await response.json()) as BrowserVersionInfo;
        if (info.webSocketDebuggerUrl) {
          return info.webSocketDebuggerUrl;
        }
      }
    } catch {
      // Chrome not ready yet
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `Chrome DevTools endpoint did not become available after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS}ms on port ${port}`,
  );
}

export async function launchChrome(options: {
  userDataDir: string;
  headless?: boolean;
  port?: number;
  width?: number;
  height?: number;
}): Promise<ChromeInstance> {
  const chromePath = findChrome();
  const port = options.port ?? (await findFreePort());
  const headless = options.headless ?? false;
  const width = options.width ?? 1280;
  const height = options.height ?? 720;

  await fs.mkdir(options.userDataDir, { recursive: true });

  const args = buildChromeArgs({
    port,
    userDataDir: options.userDataDir,
    headless,
    width,
    height,
  });

  log.info({ chromePath, port, headless, userDataDir: options.userDataDir }, 'Launching Chrome');

  // Use 'ignore' for all stdio so Chrome doesn't die from broken pipes
  // when the parent stops reading. Chrome is a GUI process — its output
  // is not useful for us beyond debugging.
  const proc = spawn(chromePath, args, {
    stdio: 'ignore',
    detached: true,
  });

  // Unreference so the Chrome process doesn't prevent the Bun event loop
  // from exiting, and doesn't get killed when the parent process ends.
  proc.unref();

  // Handle early exit during startup only
  let startupExited = false;
  const earlyExitPromise = new Promise<never>((_, reject) => {
    proc.once('exit', (code) => {
      startupExited = true;
      reject(new Error(`Chrome exited during startup with code ${code}`));
    });
  });

  const wsEndpoint = await Promise.race([pollForDevToolsEndpoint(port), earlyExitPromise]);

  // Remove the early-exit listener once launch succeeds so it doesn't
  // cause unhandled rejections if Chrome exits later during normal use.
  if (!startupExited) {
    proc.removeAllListeners('exit');
  }

  // Log if Chrome exits unexpectedly after successful launch
  proc.once('exit', (code) => {
    log.warn({ code, pid: proc.pid }, 'Chrome process exited');
  });

  log.info({ wsEndpoint, port, pid: proc.pid }, 'Chrome launched successfully');

  return { process: proc, wsEndpoint, port };
}

export async function killChrome(proc: ChildProcess): Promise<void> {
  const pid = proc.pid;
  if (!pid) return;

  let exited = false;
  proc.once('exit', () => {
    exited = true;
  });

  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/f', '/t'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.once('exit', () => resolve());
      killer.once('error', () => resolve());
    });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
    await sleep(SIGKILL_TIMEOUT_MS);
    if (!exited) {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    try {
      proc.kill('SIGTERM');
      await sleep(SIGKILL_TIMEOUT_MS);
      if (!exited) {
        proc.kill('SIGKILL');
      }
    } catch {
      // Process already gone
    }
  }
}
