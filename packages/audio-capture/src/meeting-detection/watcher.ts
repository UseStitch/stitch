import { type ChildProcess, spawn } from 'node:child_process';

import { resolveMeetingWatcherBinaryPath } from '../native-binary.js';
import { createJsonLineBuffer } from '../stream-json.js';
import { createMeetingDetectionEngine } from './engine.js';

import type { MeetingDetectionOptions, MeetingDetector } from '../types.js';
import type { MeetingObservation } from './engine.js';

const RESTART_DELAY_MS = 2_000;

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

export type WatchRow = {
  pid?: number;
  processName?: string;
  windowTitle?: string | null;
};

/** Discriminated union of native watcher events. */
type WatchEvent = { type: 'snapshot'; rows: WatchRow[] } | { type: 'error'; message: string };

/** Minimal re-use of per-platform row classification from the scanner files. */
type RowClassifier = (rows: WatchRow[]) => MeetingObservation[];

export function createNativeWatcherMeetingDetector(
  classify: RowClassifier,
  options: MeetingDetectionOptions = {},
): MeetingDetector {
  const engine = createMeetingDetectionEngine(options);
  const log = options.logger ?? noopLogger;

  let running = false;
  let child: ChildProcess | null = null;
  const stdoutBuffer = createJsonLineBuffer();

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
    } else if (event.type === 'error') {
      log.error({ message: event.message }, 'native watcher error');
    }
  }

  function scheduleRestart(): void {
    setTimeout(() => {
      if (running) startProcess();
    }, RESTART_DELAY_MS);
  }

  function startProcess(): void {
    const binaryPath = resolveMeetingWatcherBinaryPath();
    child = spawn(binaryPath, [], {
      stdio: 'pipe',
      windowsHide: true,
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuffer.append(chunk, handleLine);
    });

    child.once('exit', (_code, _signal) => {
      child = null;
      if (running) scheduleRestart();
    });

    child.once('error', () => {
      child = null;
      if (running) scheduleRestart();
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
