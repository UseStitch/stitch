import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MacMeetingService } from '../src/meetings/mac-meeting.js';

import type { MeetingInfo } from '../src/meetings/meeting-service.js';
import type { RecordingHandle, RecordingResult } from '../src/writers/recording-writer.js';

const IS_MACOS = platform() === 'darwin';

// ---------------------------------------------------------------------------
// Shared refs so tests can access mock instances (assigned inside vi.mock)
// ---------------------------------------------------------------------------

interface MockProcessInfo {
  pid: number;
  name: string;
  bundleId: string;
}

interface MockMonitorInstance {
  started: boolean;
  simulateChange(processes: MockProcessInfo[]): void;
  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
  emit(event: string, ...args: unknown[]): boolean;
}

const monitorRef: { current: MockMonitorInstance | null } = { current: null };
const processRef: { current: MockProcessInfo[] } = { current: [] };

vi.mock('native-audio-node', () => {
  const { EventEmitter } = require('node:events');

  class MockMicrophoneActivityMonitor extends EventEmitter {
    started = false;

    constructor() {
      super();
      monitorRef.current = this as unknown as MockMonitorInstance;
    }

    start(): void {
      this.started = true;
    }

    stop(): void {
      this.started = false;
    }

    getActiveProcesses() {
      return processRef.current;
    }

    simulateChange(processes: MockProcessInfo[]): void {
      processRef.current = processes;
      this.emit('change');
    }
  }

  return {
    MicrophoneActivityMonitor: MockMicrophoneActivityMonitor,
  };
});

vi.mock('@stitch/shared/id', () => {
  let counter = 0;
  return {
    createRecordingId: () => `rec_${++counter}`,
  };
});

// ---------------------------------------------------------------------------
// Mock RecordingWriter
// ---------------------------------------------------------------------------

class MockRecordingWriter {
  baseDir: string;
  startedRecordings = new Map<string, RecordingHandle>();

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async start(recordingId: string): Promise<RecordingHandle> {
    const handle: RecordingHandle = {
      id: recordingId,
      dir: join(this.baseDir, recordingId),
      startedAt: new Date(),
    };
    this.startedRecordings.set(recordingId, handle);
    return handle;
  }

  async stop(handle: RecordingHandle): Promise<RecordingResult> {
    this.startedRecordings.delete(handle.id);
    return {
      id: handle.id,
      dir: handle.dir,
      file: {
        name: 'recording.wav',
        path: join(handle.dir, 'recording.wav'),
        durationSecs: 60,
      },
    };
  }

  async discard(handle: RecordingHandle): Promise<void> {
    this.startedRecordings.delete(handle.id);
  }
}

// ---------------------------------------------------------------------------
// Import MacMeetingService (after mocks are set up)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;
let writer: MockRecordingWriter;

function createService(apps: string[] = ['chrome', 'slack', 'zoom']): MacMeetingService {
  return new MacMeetingService({
    apps,
    writer: writer as unknown as import('../src/writers/recording-writer.js').RecordingWriter,
    pollIntervalMs: 1000,
  });
}

function collectEvents(service: MacMeetingService) {
  const starts: MeetingInfo[] = [];
  const stops: MeetingInfo[] = [];
  const writes: { meeting: MeetingInfo; result: RecordingResult }[] = [];

  service.on('meeting:start', (m) => starts.push(m));
  service.on('meeting:stop', (m) => stops.push(m));
  service.on('recording:write', (m, r) => writes.push({ meeting: m, result: r }));

  return { starts, stops, writes };
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

/** Set of PIDs that should be considered dead (process.kill will throw) */
const deadPids = new Set<number>();
const originalKill = process.kill.bind(process);

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'mac-meeting-test-'));
  writer = new MockRecordingWriter(tempDir);
  processRef.current = [];
  monitorRef.current = null;
  deadPids.clear();

  // Mock process.kill for PID liveness checks (signal 0)
  process.kill = ((pid: number, signal?: string | number) => {
    if (signal === 0) {
      if (deadPids.has(pid)) {
        throw new Error('ESRCH');
      }
      return true;
    }
    return originalKill(pid, signal as number);
  }) as typeof process.kill;
});

afterEach(async () => {
  process.kill = originalKill;
  await rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests: Chrome helper PID-based tracking (the core fix)
// ---------------------------------------------------------------------------

describe.skipIf(!IS_MACOS)('Chrome helper PID-based tracking', () => {
  test('detects Chrome Helper as a new meeting by PID', async () => {
    const service = createService();
    const events = collectEvents(service);

    processRef.current = [];
    await service.start();

    monitorRef.current!.simulateChange([
      { pid: 1001, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();

    expect(events.starts).toHaveLength(1);
    expect(events.starts[0].app).toBe('Google Chrome Helper');

    await service.stop();
  });

  test('recording stops when specific Chrome Helper PID releases mic, even if another Chrome Helper still has mic', async () => {
    const service = createService();
    const events = collectEvents(service);

    processRef.current = [];
    await service.start();

    // First Chrome Helper starts using mic (meeting tab)
    monitorRef.current!.simulateChange([
      { pid: 1001, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();
    expect(events.starts).toHaveLength(1);

    // Accept the recording
    await service.startRecording(events.starts[0].id);

    // Second Chrome Helper also starts using mic (different tab)
    monitorRef.current!.simulateChange([
      { pid: 1001, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
      { pid: 1002, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();

    // Second helper is a new meeting detection
    expect(events.starts).toHaveLength(2);

    // First Chrome Helper (PID 1001) releases mic, but PID 1002 still has it
    monitorRef.current!.simulateChange([
      { pid: 1002, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();

    // The first recording should stop
    expect(events.stops).toHaveLength(1);
    expect(events.stops[0].id).toBe(events.starts[0].id);
    expect(events.writes).toHaveLength(1);

    await service.stop();
  });

  test('recording stops when Chrome Helper PID dies even if OS still reports mic usage', async () => {
    const service = createService();
    const events = collectEvents(service);

    processRef.current = [];
    await service.start();

    // Chrome Helper starts using mic
    monitorRef.current!.simulateChange([
      { pid: 1100, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();
    expect(events.starts).toHaveLength(1);

    await service.startRecording(events.starts[0].id);

    // Tab closed: process dies, but OS still reports mic usage (stale entry)
    deadPids.add(1100);
    monitorRef.current!.simulateChange([
      { pid: 1100, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();

    // Recording should stop because the PID is no longer alive
    expect(events.stops).toHaveLength(1);
    expect(events.writes).toHaveLength(1);

    await service.stop();
  });

  test('detected meeting is cleaned up when its PID dies', async () => {
    const service = createService();
    const events = collectEvents(service);

    processRef.current = [];
    await service.start();

    monitorRef.current!.simulateChange([
      { pid: 1200, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();
    expect(events.starts).toHaveLength(1);

    // PID dies before user accepts (OS still reports it)
    deadPids.add(1200);
    monitorRef.current!.simulateChange([
      { pid: 1200, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();

    expect(events.stops).toHaveLength(1);
    expect(events.writes).toHaveLength(0); // Never started recording

    await service.stop();
  });

  test('non-helper app with bundle ID uses bundle-based key (Slack)', async () => {
    const service = createService();
    const events = collectEvents(service);

    processRef.current = [];
    await service.start();

    // Slack appears
    monitorRef.current!.simulateChange([
      { pid: 2001, name: 'Slack', bundleId: 'com.tinyspeck.slackmacgap' },
    ]);
    await flush();
    expect(events.starts).toHaveLength(1);

    await service.startRecording(events.starts[0].id);

    // Slack restarts with a new PID but same bundle ID
    monitorRef.current!.simulateChange([
      { pid: 2002, name: 'Slack', bundleId: 'com.tinyspeck.slackmacgap' },
    ]);
    await flush();

    // Should NOT detect a new meeting (same bundle key)
    // Should NOT stop the recording (bundle key is still present)
    expect(events.starts).toHaveLength(1);
    expect(events.stops).toHaveLength(0);

    await service.stop();
  });

  test('unknown bundleId falls back to PID-based key', async () => {
    const service = createService(['myapp']);
    const events = collectEvents(service);

    processRef.current = [];
    await service.start();

    monitorRef.current!.simulateChange([{ pid: 3001, name: 'MyApp', bundleId: 'unknown' }]);
    await flush();
    expect(events.starts).toHaveLength(1);

    await service.startRecording(events.starts[0].id);

    // Same app appears with different PID but still unknown bundle
    monitorRef.current!.simulateChange([{ pid: 3002, name: 'MyApp', bundleId: 'unknown' }]);
    await flush();

    // Old recording should stop (PID 3001 is gone)
    expect(events.stops).toHaveLength(1);
    // New meeting detected with PID 3002
    expect(events.starts).toHaveLength(2);

    await service.stop();
  });
});

// ---------------------------------------------------------------------------
// Tests: General meeting lifecycle
// ---------------------------------------------------------------------------

describe.skipIf(!IS_MACOS)('meeting lifecycle', () => {
  test('does not detect baseline processes as meetings', async () => {
    const service = createService();
    const events = collectEvents(service);

    // Chrome is already using mic when service starts
    processRef.current = [
      { pid: 4001, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ];
    await service.start();

    // Fire a change with the same process still there
    monitorRef.current!.simulateChange([
      { pid: 4001, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();

    expect(events.starts).toHaveLength(0);

    await service.stop();
  });

  test('baseline entry is removed when it disappears, enabling future detection', async () => {
    const service = createService();
    const events = collectEvents(service);

    // Chrome Helper is baseline
    processRef.current = [
      { pid: 5001, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ];
    await service.start();

    // Chrome Helper disappears
    monitorRef.current!.simulateChange([]);
    await flush();

    expect(events.starts).toHaveLength(0);

    // Chrome Helper returns with new PID - should be detected
    monitorRef.current!.simulateChange([
      { pid: 5002, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();

    expect(events.starts).toHaveLength(1);

    await service.stop();
  });

  test('does not detect non-monitored apps', async () => {
    const service = createService(['slack']);
    const events = collectEvents(service);

    processRef.current = [];
    await service.start();

    monitorRef.current!.simulateChange([
      { pid: 6001, name: 'Safari', bundleId: 'com.apple.Safari' },
    ]);
    await flush();

    expect(events.starts).toHaveLength(0);

    await service.stop();
  });

  test('meeting:stop fires for detected (not yet recording) meetings when process disappears', async () => {
    const service = createService();
    const events = collectEvents(service);

    processRef.current = [];
    await service.start();

    monitorRef.current!.simulateChange([{ pid: 7001, name: 'Zoom', bundleId: 'us.zoom.xos' }]);
    await flush();
    expect(events.starts).toHaveLength(1);

    // Process disappears before user accepts
    monitorRef.current!.simulateChange([]);
    await flush();

    expect(events.stops).toHaveLength(1);
    expect(events.stops[0].id).toBe(events.starts[0].id);
    expect(events.writes).toHaveLength(0);

    await service.stop();
  });

  test('stopRecording via manual call works', async () => {
    const service = createService();
    const events = collectEvents(service);

    processRef.current = [];
    await service.start();

    monitorRef.current!.simulateChange([
      { pid: 8001, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();

    await service.startRecording(events.starts[0].id);
    const result = await service.stopRecording(events.starts[0].id);

    expect(result.id).toBe(events.starts[0].id);
    expect(events.writes).toHaveLength(1);

    await service.stop();
  });

  test('cancelMeeting on a detected meeting cleans up internal state', async () => {
    const service = createService();
    const events = collectEvents(service);

    processRef.current = [];
    await service.start();

    monitorRef.current!.simulateChange([
      { pid: 9001, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();
    expect(events.starts).toHaveLength(1);

    // Cancel before accepting
    await service.cancelMeeting(events.starts[0].id);

    // The same PID is still active -- it should now be detectable again
    monitorRef.current!.simulateChange([
      { pid: 9001, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();

    expect(events.starts).toHaveLength(2);

    await service.stop();
  });

  test('cancelMeeting on an active recording discards it and allows re-detection', async () => {
    const service = createService();
    const events = collectEvents(service);

    processRef.current = [];
    await service.start();

    monitorRef.current!.simulateChange([
      { pid: 10001, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();
    expect(events.starts).toHaveLength(1);

    await service.startRecording(events.starts[0].id);

    // Cancel the active recording
    await service.cancelMeeting(events.starts[0].id);

    // No recording:write should have been emitted (discarded, not stopped)
    expect(events.writes).toHaveLength(0);

    // The same PID is still active -- it should now be detectable again
    monitorRef.current!.simulateChange([
      { pid: 10001, name: 'Google Chrome Helper', bundleId: 'com.google.Chrome.helper' },
    ]);
    await flush();

    expect(events.starts).toHaveLength(2);

    await service.stop();
  });

  test('cancelMeeting is a no-op for unknown meeting IDs', async () => {
    const service = createService();

    processRef.current = [];
    await service.start();

    // Should not throw
    await service.cancelMeeting('rec_nonexistent');

    await service.stop();
  });
});
