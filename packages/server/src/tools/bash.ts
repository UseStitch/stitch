import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { tool } from 'ai';
import { z } from 'zod';

import type { PermissionSuggestion } from '@openwork/shared';

import { resolvePreferredShell } from '@/lib/shell.js';
import { deriveCommandFamilies, getCommandFamilySuggestion } from '@/tools/bash-families.js';
import type { ToolContext } from '@/tools/wrappers.js';
import { withPermissionGate, withTruncation } from '@/tools/wrappers.js';

const SIGKILL_TIMEOUT_MS = 200;
const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_METADATA_LENGTH = 30_000;

const bashInputSchema = z.object({
  command: z.string().min(1).describe('The shell command to run'),
  workdir: z.string().describe('The absolute working directory to run the command in'),
  timeout: z.number().optional().describe('Optional timeout in milliseconds (defaults to 120000, max 600000)'),
  description: z
    .string()
    .min(1)
    .describe('Short plain-language description (5-10 words) of what this command does'),
});

async function validateAbsoluteDirectoryPath(workdir: string): Promise<string> {
  if (!path.isAbsolute(workdir)) {
    throw new Error('workdir must be an absolute directory path');
  }

  const resolved = path.resolve(workdir);
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error('workdir must point to an existing directory');
  }

  return resolved;
}

function normalizeTimeout(timeout: number | undefined): number {
  if (timeout === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout < 1) {
    throw new Error('timeout must be a positive number');
  }
  return Math.min(Math.trunc(timeout), MAX_TIMEOUT_MS);
}

async function killProcessTree(proc: ChildProcess, exited: () => boolean): Promise<void> {
  const pid = proc.pid;
  if (!pid || exited()) return;

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
    if (!exited()) {
      process.kill(-pid, 'SIGKILL');
    }
    return;
  } catch {
    proc.kill('SIGTERM');
    await sleep(SIGKILL_TIMEOUT_MS);
    if (!exited()) {
      proc.kill('SIGKILL');
    }
  }
}

function createBashTool() {
  return tool({
    description: `Run a shell command in a specified folder.

Usage:
- This tool is for terminal operations.
- workdir is required and must be an absolute folder path.
- Do not use this tool for file read/write/search/edit when read, write, glob, grep, and edit tools are available.
- Keep commands focused and safe.
- timeout is optional and defaults to 120000 ms.
- Output may be truncated for metadata safety.`,
    inputSchema: bashInputSchema,
    execute: async (input, { abortSignal }) => {
      const workdir = await validateAbsoluteDirectoryPath(input.workdir);
      const timeout = normalizeTimeout(input.timeout);
      const shell = resolvePreferredShell().shell;
      const proc = spawn(input.command, {
        shell,
        cwd: workdir,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: process.platform === 'win32',
      });

      let output = '';
      const append = (chunk: Buffer) => {
        output += chunk.toString();
      };

      proc.stdout?.on('data', append);
      proc.stderr?.on('data', append);

      let timedOut = false;
      let aborted = false;
      let exited = false;

      const kill = () => killProcessTree(proc, () => exited);

      if (abortSignal?.aborted) {
        aborted = true;
        await kill();
      }

      const abortHandler = () => {
        aborted = true;
        void kill();
      };

      abortSignal?.addEventListener('abort', abortHandler, { once: true });

      const timeoutId = setTimeout(() => {
        timedOut = true;
        void kill();
      }, timeout + 100);

      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timeoutId);
          abortSignal?.removeEventListener('abort', abortHandler);
        };

        proc.once('exit', () => {
          exited = true;
          cleanup();
          resolve();
        });

        proc.once('error', (error) => {
          exited = true;
          cleanup();
          reject(error);
        });
      });

      const runtimeNotes: string[] = [];
      if (timedOut) runtimeNotes.push(`Command timed out after ${timeout} ms`);
      if (aborted) runtimeNotes.push('Command was aborted');

      if (runtimeNotes.length > 0) {
        output += `\n\n<shell_metadata>\n${runtimeNotes.join('\n')}\n</shell_metadata>`;
      }

      return {
        title: input.description,
        output,
        metadata: {
          description: input.description,
          exit: proc.exitCode,
          output:
            output.length > MAX_METADATA_LENGTH
              ? `${output.slice(0, MAX_METADATA_LENGTH)}\n\n...`
              : output,
        },
      };
    },
  });
}

function getPatternTargets(input: unknown): string[] {
  const command = (input as { command?: unknown })?.command;
  if (typeof command !== 'string' || command.trim().length === 0) return [];
  return deriveCommandFamilies(command).map((family) => family.pattern);
}

function getSuggestion(input: unknown): PermissionSuggestion | null {
  const command = (input as { command?: unknown })?.command;
  if (typeof command !== 'string' || command.trim().length === 0) return null;
  return getCommandFamilySuggestion(command);
}

const shouldTruncate = true;

export function createRegisteredTool(context: ToolContext) {
  const baseTool = createBashTool();
  const gatedTool = withPermissionGate(
    'bash',
    {
      getPatternTargets,
      getSuggestion,
    },
    baseTool,
    context,
  );

  return shouldTruncate ? withTruncation(gatedTool) : gatedTool;
}
