import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import treeKill from 'tree-kill'

const HEALTH_POLL_INTERVAL_MS = 100
const HEALTH_TIMEOUT_MS = 30_000
const HOSTNAME = '127.0.0.1'

let serverProcess: ChildProcess | null = null

function getMonorepoRoot(): string {
  // app.getAppPath() points to apps/desktop in dev (the package dir)
  // Go up two levels to reach the monorepo root
  return resolve(app.getAppPath(), '../..')
}

function getSidecarCommand(port: number): { cmd: string; args: string[]; cwd?: string } {
  const portArgs = ['--port', String(port), '--hostname', HOSTNAME]

  if (app.isPackaged) {
    const suffix = process.platform === 'win32' ? '.exe' : ''
    const binaryPath = join(process.resourcesPath, `openwork-server${suffix}`)
    return { cmd: binaryPath, args: portArgs }
  }

  const root = getMonorepoRoot()
  const serverEntry = join(root, 'packages/server/src/index.ts')
  const cwd = join(root, 'packages/server')
  return { cmd: 'node', args: ['--import', 'tsx/esm', serverEntry, ...portArgs], cwd }
}

export async function findAvailablePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, HOSTNAME, () => {
      const address = server.address()
      if (typeof address !== 'object' || !address) {
        server.close()
        reject(new Error('Failed to get port'))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

async function checkHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function waitForHealthy(url: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (await checkHealth(url)) return
    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS))
  }

  throw new Error(`Server failed to become healthy within ${HEALTH_TIMEOUT_MS}ms`)
}

export async function spawnServer(port: number): Promise<string> {
  const { cmd, args, cwd } = getSidecarCommand(port)
  const url = `http://${HOSTNAME}:${port}`

  console.log(`[sidecar] spawning: ${cmd} ${args.join(' ')}`)

  serverProcess = spawn(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    ...(cwd && { cwd }),
  })

  serverProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[sidecar:stdout] ${data.toString().trim()}`)
  })

  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[sidecar:stderr] ${data.toString().trim()}`)
  })

  const exitPromise = new Promise<never>((_resolve, reject) => {
    serverProcess!.on('exit', (code, signal) => {
      reject(new Error(`Server exited before becoming healthy (code=${code}, signal=${signal})`))
    })
    serverProcess!.on('error', (err) => {
      reject(new Error(`Failed to spawn server: ${err.message}`))
    })
  })

  await Promise.race([waitForHealthy(url), exitPromise])

  return url
}

export function killServer(): void {
  if (!serverProcess?.pid) return
  treeKill(serverProcess.pid)
  serverProcess = null
}
