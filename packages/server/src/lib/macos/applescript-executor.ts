import { execFile } from 'node:child_process';

import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'macos.applescript' });

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

type ExecuteOptions = {
  timeout?: number;
  signal?: AbortSignal;
};

/**
 * Parse an AppleScript error message from osascript stderr.
 * Returns a clean, user-facing error string.
 */
function parseError(stderr: string): string {
  const trimmed = stderr.trim();

  // Permission denied (-1743): app not authorized for automation
  if (trimmed.includes('-1743')) {
    return 'Permission denied. Grant Automation access in System Settings > Privacy & Security > Automation.';
  }

  // Element not found (-1728): referenced object doesn't exist
  if (trimmed.includes('-1728')) {
    return 'Element not found. The referenced object does not exist in the target application.';
  }

  // Application not found (-600): app isn't running or doesn't exist
  if (trimmed.includes('-600')) {
    return 'Application not found. It may not be installed or is not running.';
  }

  // Connection invalid (-609): app is not running
  if (trimmed.includes('-609')) {
    return 'Application is not running. Use `tell application "X" to activate` first.';
  }

  // User cancelled (-128): dialog was dismissed
  if (trimmed.includes('-128')) {
    return 'Action cancelled by user.';
  }

  // Generic AppleScript execution error — extract the message
  const execMatch = /execution error: (.+?)(?:\s*\(-?\d+\))?$/.exec(trimmed);
  if (execMatch) {
    return `AppleScript error: ${execMatch[1].trim()}`;
  }

  // Syntax error
  if (trimmed.includes('syntax error')) {
    return `AppleScript syntax error: ${trimmed}`;
  }

  return `AppleScript error: ${trimmed || 'Unknown error'}`;
}

/**
 * Execute an AppleScript string via osascript.
 * Returns the trimmed stdout on success.
 * Throws a descriptive Error on failure.
 */
export function executeAppleScript(script: string, options?: ExecuteOptions): Promise<string> {
  const timeoutMs = Math.min(
    Math.max((options?.timeout ?? DEFAULT_TIMEOUT_MS / 1000) * 1000, 1000),
    MAX_TIMEOUT_MS,
  );

  return new Promise((resolve, reject) => {
    const child = execFile(
      '/usr/bin/osascript',
      ['-e', script],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          if (options?.signal?.aborted) {
            reject(new DOMException('AppleScript execution aborted', 'AbortError'));
            return;
          }

          if ('killed' in error && error.killed) {
            reject(new Error(`AppleScript timed out after ${timeoutMs / 1000}s.`));
            return;
          }

          const message = parseError(stderr || error.message);
          log.warn(
            { event: 'applescript.error', message, script: script.slice(0, 200) },
            'AppleScript execution failed',
          );
          reject(new Error(message));
          return;
        }

        resolve(stdout.trim());
      },
    );

    if (options?.signal) {
      const onAbort = () => {
        child.kill('SIGTERM');
      };

      if (options.signal.aborted) {
        child.kill('SIGTERM');
      } else {
        options.signal.addEventListener('abort', onAbort, { once: true });
        child.on('close', () => options.signal?.removeEventListener('abort', onAbort));
      }
    }
  });
}
