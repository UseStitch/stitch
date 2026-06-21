import { app } from 'electron';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import treeKill from 'tree-kill';

const HEALTH_POLL_INTERVAL_MS = 100;
const HEALTH_TIMEOUT_MS = 30_000;
const KILL_TIMEOUT_MS = 5_000;
const HOSTNAME = '127.0.0.1';

let serverProcess: ChildProcess | null = null;

function getMonorepoRoot(): string {
  // app.getAppPath() points to apps/desktop in dev (the package dir)
  // Go up two levels to reach the monorepo root
  return resolve(app.getAppPath(), '../..');
}

function getSidecarCommand(port: number): { cmd: string; args: string[]; cwd?: string } {
  const portArgs = ['--port', String(port), '--hostname', HOSTNAME];

  if (app.isPackaged) {
    const suffix = process.platform === 'win32' ? '.exe' : '';
    const binaryPath = join(process.resourcesPath, `stitch-server${suffix}`);
    return { cmd: binaryPath, args: portArgs };
  }

  const root = getMonorepoRoot();
  const serverEntry = join(root, 'packages/server/src/index.ts');
  const cwd = join(root, 'packages/server');
  return { cmd: 'bun', args: [serverEntry, ...portArgs], cwd };
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

export async function checkHealth(url: string): Promise<boolean> {
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

function findStalePids(): number[] {
  try {
    if (process.platform === 'win32') {
      const output = execSync('tasklist /FI "IMAGENAME eq stitch-server.exe" /FO CSV /NH', {
        encoding: 'utf8',
        timeout: 3_000,
      }).trim();
      if (!output) return [];
      return output
        .split('\n')
        .map((line) => parseInt(line.split(',')[1]?.replace(/"/g, '') ?? '', 10))
        .filter(Number.isFinite);
    }

    const output = execSync('pgrep -f stitch-server', {
      encoding: 'utf8',
      timeout: 3_000,
    }).trim();
    if (!output) return [];
    return output
      .split('\n')
      .map((s) => parseInt(s, 10))
      .filter(Number.isFinite);
  } catch {
    // pgrep returns exit code 1 when no matches; tasklist may fail — ignore
    return [];
  }
}

function killStaleServers(): void {
  const pids = findStalePids();
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already dead or not owned
    }
  }
  if (pids.length > 0) {
    console.log(`[sidecar] killed ${pids.length} stale stitch-server process(es)`);
  }
}

export async function spawnServer(port: number, extraEnv: NodeJS.ProcessEnv = {}): Promise<string> {
  if (app.isPackaged) {
    killStaleServers();
  }

  const { cmd, args, cwd } = getSidecarCommand(port);
  const url = `http://${HOSTNAME}:${port}`;

  console.log(`[sidecar] spawning: ${cmd} ${args.join(' ')}`);

  const sidecarEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    NODE_ENV: app.isPackaged ? 'production' : 'development',
    STITCH_APP_NAME: app.isPackaged ? 'stitch' : 'stitch-dev',
    STITCH_APP_VERSION: app.getVersion(),
    STITCH_CHANNEL: app.isPackaged ? 'production' : 'development',
    STITCH_CLIENT: 'desktop',
  };

  if (app.isPackaged) {
    const suffix = process.platform === 'win32' ? '.exe' : '';
    sidecarEnv.SANDBOX_EXEC_PATH = join(process.resourcesPath, `stitch-sandbox${suffix}`);
  } else {
    const root = getMonorepoRoot();
    sidecarEnv.SANDBOX_EXEC_PATH = join(root, 'packages/server/src/code-mode/sandbox-process.ts');
  }

  serverProcess = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: sidecarEnv,
    ...(cwd && { cwd }),
  });

  serverProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[sidecar:stdout] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[sidecar:stderr] ${data.toString().trim()}`);
  });

  const exitPromise = new Promise<never>((_resolve, reject) => {
    serverProcess!.on('exit', (code, signal) => {
      reject(new Error(`Server exited before becoming healthy (code=${code}, signal=${signal})`));
    });
    serverProcess!.on('error', (err) => {
      reject(new Error(`Failed to spawn server: ${err.message}`));
    });
  });

  await Promise.race([waitForHealthy(url), exitPromise]);

  return url;
}

export async function killServer(): Promise<void> {
  const proc = serverProcess;
  if (!proc?.pid) return;

  serverProcess = null;

  const pid = proc.pid;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // already dead
      }
      resolve();
    }, KILL_TIMEOUT_MS);

    proc.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });

    treeKill(pid, 'SIGTERM', (err) => {
      if (err) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // already dead
        }
      }
    });
  });
}
