import { app, utilityProcess, type UtilityProcess } from 'electron';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve, dirname } from 'node:path';

const HEALTH_POLL_INTERVAL_MS = 100;
const HEALTH_TIMEOUT_MS = 30_000;
const BUNDLE_WAIT_TIMEOUT_MS = 60_000;
const HOSTNAME = '127.0.0.1';

let serverProcess: UtilityProcess | null = null;

function getMonorepoRoot(): string {
  return resolve(app.getAppPath(), '../..');
}

function getServerScriptPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'stitch-server.mjs');
  }

  const root = getMonorepoRoot();
  return join(root, 'packages/server/dist/stitch-server.mjs');
}

// In dev, the server bundle is built by esbuild --watch in parallel.
// Wait for it to appear on disk before trying to fork it.
async function waitForBundle(scriptPath: string): Promise<void> {
  if (existsSync(scriptPath)) return;

  console.log(`[server] waiting for bundle at ${scriptPath}...`);
  const deadline = Date.now() + BUNDLE_WAIT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    if (existsSync(scriptPath)) return;
  }

  throw new Error(
    `Server bundle not found after ${BUNDLE_WAIT_TIMEOUT_MS}ms: ${scriptPath}\nRun "bun run build:sidecar" or ensure the server dev watcher is running.`,
  );
}

export async function findAvailablePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, HOSTNAME, () => {
      const address = server.address();
      if (typeof address !== 'object' || !address) {
        server.close();
        reject(new Error('Failed to get port'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function checkHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealthy(url: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await checkHealth(url)) return;
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
  }

  throw new Error(`Server failed to become healthy within ${HEALTH_TIMEOUT_MS}ms`);
}

export async function spawnServer(port: number): Promise<string> {
  const scriptPath = getServerScriptPath();
  const url = `http://${HOSTNAME}:${port}`;

  await waitForBundle(scriptPath);
  console.log(`[server] starting: ${scriptPath}`);

  const serverEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: app.isPackaged ? 'production' : 'development',
    STITCH_APP_NAME: app.isPackaged ? 'stitch' : 'stitch-dev',
    // Anchors runtime asset and migration resolution to the correct directory
    STITCH_SERVER_DIR: app.isPackaged ? process.resourcesPath : dirname(scriptPath),
  };

  if (app.isPackaged) {
    const suffix = process.platform === 'win32' ? '.exe' : '';
    serverEnv.STITCH_AUDIO_CAPTURE_BIN = join(
      process.resourcesPath,
      'audio-capture',
      `stitch-audio-capture${suffix}`,
    );
    serverEnv.STITCH_MEETING_WATCH_BIN = join(
      process.resourcesPath,
      'audio-capture',
      `stitch-meeting-watch${suffix}`,
    );
  }

  serverProcess = utilityProcess.fork(
    scriptPath,
    [`--port`, String(port), `--hostname`, HOSTNAME],
    {
      env: serverEnv,
      stdio: 'pipe',
    },
  );

  serverProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[server:stdout] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[server:stderr] ${data.toString().trim()}`);
  });

  const exitPromise = new Promise<never>((_resolve, reject) => {
    serverProcess!.once('exit', (code) => {
      reject(new Error(`Server exited before becoming healthy (code=${code})`));
    });
  });

  await Promise.race([waitForHealthy(url), exitPromise]);

  return url;
}

const KILL_TIMEOUT_MS = 5_000;

export async function killServer(): Promise<void> {
  const proc = serverProcess;
  if (!proc) return;

  serverProcess = null;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        // already dead
      }
      resolve();
    }, KILL_TIMEOUT_MS);

    proc.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    proc.kill();
  });
}
