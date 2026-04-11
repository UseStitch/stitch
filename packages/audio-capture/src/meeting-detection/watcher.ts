import { type ChildProcess, spawn } from 'node:child_process';

import { resolveNativeBinaryPath } from '../native-binary.js';
import { createMeetingDetectionEngine } from './engine.js';

import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';
import type { MeetingObservation } from './engine.js';

/** Raw row shape emitted by the native watcher on stdout. */
export type WatchRow = {
  pid?: number;
  processName?: string;
  windowTitle?: string | null;
};

/** Discriminated union of native watcher events. */
type WatchEvent = { type: 'snapshot'; rows: WatchRow[] } | { type: 'error'; message: string };

/** Platform-specific flag passed to the native binary. */
type WatchPlatform = 'macos' | 'windows';

function watchFlag(platform: WatchPlatform): string {
  return platform === 'macos' ? '--watch-macos-meeting-usage' : '--watch-windows-meeting-usage';
}

/** Minimal re-use of per-platform row classification from the scanner files. */
type RowClassifier = (rows: WatchRow[]) => MeetingObservation[];

/**
 * Spawns the native watcher binary and wires its snapshot stream into the
 * MeetingDetectionEngine. Returns a full MeetingDetector handle.
 */
export function createNativeWatcherMeetingDetector(
  platform: WatchPlatform,
  classify: RowClassifier,
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  const engine = createMeetingDetectionEngine(options);

  let running = false;
  let child: ChildProcess | null = null;
  let stdoutBuffer = '';

  function handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let event: WatchEvent;
    try {
      event = JSON.parse(trimmed) as WatchEvent;
    } catch {
      return;
    }

    if (event.type === 'snapshot') {
      const observations = classify(event.rows);
      engine.ingest(observations);
    }
    // 'error' events are non-fatal; the watcher keeps running.
  }

  function startProcess(): void {
    const binaryPath = resolveNativeBinaryPath();
    child = spawn(binaryPath, [watchFlag(platform)], {
      stdio: 'pipe',
      windowsHide: true,
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() ?? '';
      for (const line of lines) {
        handleLine(line);
      }
    });

    child.once('exit', (_code, _signal) => {
      child = null;
      // Restart unless we're shutting down intentionally.
      if (running) {
        const delay = 2_000;
        setTimeout(() => {
          if (running) {
            startProcess();
          }
        }, delay);
      }
    });

    child.once('error', () => {
      child = null;
      if (running) {
        setTimeout(() => {
          if (running) {
            startProcess();
          }
        }, 2_000);
      }
    });
  }

  function stopProcess(): void {
    if (child) {
      child.removeAllListeners();
      child.stdout?.removeAllListeners();
      child.kill('SIGTERM');
      child = null;
    }
  }

  return {
    start(): void {
      if (running) return;
      running = true;
      startProcess();
    },

    stop(): void {
      running = false;
      stopProcess();
    },

    subscribe: engine.subscribe.bind(engine),
    getActive: engine.getActive.bind(engine),
  };
}
