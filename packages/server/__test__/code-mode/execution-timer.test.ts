import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  createAbortRace,
  createExecutionTimeoutRace,
  createPausableTimer,
  wrapWithPausableTimeout,
} from '@/code-mode/isolate/execution-timer.js';

describe('createPausableTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('reports elapsed time when not paused', () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();

    vi.advanceTimersByTime(500);

    expect(timer.getElapsed(startedAt)).toBe(500);
  });

  test('pausing stops elapsed time accumulation', () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();

    vi.advanceTimersByTime(200);
    timer.pause();
    vi.advanceTimersByTime(300);

    expect(timer.getElapsed(startedAt)).toBe(200);
  });

  test('resuming resumes elapsed time accumulation', () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();

    vi.advanceTimersByTime(200);
    timer.pause();
    vi.advanceTimersByTime(300);
    timer.resume();
    vi.advanceTimersByTime(100);

    expect(timer.getElapsed(startedAt)).toBe(300);
  });

  test('multiple pause/resume cycles accumulate correctly', () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();

    vi.advanceTimersByTime(100); // 100ms active
    timer.pause();
    vi.advanceTimersByTime(200); // 200ms paused
    timer.resume();
    vi.advanceTimersByTime(150); // 150ms active
    timer.pause();
    vi.advanceTimersByTime(500); // 500ms paused
    timer.resume();
    vi.advanceTimersByTime(50); // 50ms active

    expect(timer.getElapsed(startedAt)).toBe(300);
    expect(timer.getTotalPausedMs()).toBe(700);
  });

  test('getPausedAt returns null when not paused', () => {
    const timer = createPausableTimer();
    expect(timer.getPausedAt()).toBeNull();
  });

  test('getPausedAt returns timestamp when paused', () => {
    const timer = createPausableTimer();
    const before = Date.now();
    timer.pause();
    expect(timer.getPausedAt()).toBe(before);
  });

  test('double pause is a no-op', () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();

    timer.pause();
    const firstPausedAt = timer.getPausedAt();
    vi.advanceTimersByTime(100);
    timer.pause();

    expect(timer.getPausedAt()).toBe(firstPausedAt);
    expect(timer.getElapsed(startedAt)).toBe(0);
  });

  test('double resume is a no-op', () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();

    vi.advanceTimersByTime(100);
    timer.pause();
    vi.advanceTimersByTime(200);
    timer.resume();
    timer.resume();
    vi.advanceTimersByTime(50);

    expect(timer.getElapsed(startedAt)).toBe(150);
    expect(timer.getTotalPausedMs()).toBe(200);
  });
});

describe('createAbortRace', () => {
  test('returns null when no signal provided', () => {
    const result = createAbortRace(undefined, 'test');
    expect(result).toBeNull();
  });

  test('rejects immediately if signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = createAbortRace(controller.signal, 'already aborted');
    await expect(promise).rejects.toThrow('already aborted');
  });

  test('rejects when signal is aborted', async () => {
    const controller = new AbortController();
    const promise = createAbortRace(controller.signal, 'was aborted');

    controller.abort();
    await expect(promise).rejects.toThrow('was aborted');
  });
});

describe('createExecutionTimeoutRace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('rejects after timeout elapses', async () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();
    const race = createExecutionTimeoutRace(timer, startedAt, 1000);

    const rejection = expect(race.promise).rejects.toThrow('timed out after 1000ms');

    vi.advanceTimersByTime(1100);
    await rejection;

    expect(race.isTimedOut()).toBe(true);
    race.cleanup();
  });

  test('does not reject before timeout', async () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();
    const race = createExecutionTimeoutRace(timer, startedAt, 1000);

    vi.advanceTimersByTime(500);
    expect(race.isTimedOut()).toBe(false);

    race.cleanup();
  });

  test('cleanup prevents rejection', () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();
    const race = createExecutionTimeoutRace(timer, startedAt, 1000);

    race.cleanup();
    vi.advanceTimersByTime(2000);
    expect(race.isTimedOut()).toBe(false);
  });
});

describe('wrapWithPausableTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('pauses timer during execution and resumes after', async () => {
    const timer = createPausableTimer();
    const execute = vi.fn().mockResolvedValue('result');

    const wrapped = wrapWithPausableTimeout(execute, timer, 5000);
    const promise = wrapped({ test: true });

    expect(timer.getPausedAt()).not.toBeNull();

    const result = await promise;

    expect(result).toBe('result');
    expect(timer.getPausedAt()).toBeNull();
  });

  test('resumes timer even on execution failure', async () => {
    const timer = createPausableTimer();
    const execute = vi.fn().mockRejectedValue(new Error('failed'));

    const wrapped = wrapWithPausableTimeout(execute, timer, 5000);

    await expect(wrapped({})).rejects.toThrow('failed');
    expect(timer.getPausedAt()).toBeNull();
  });

  test('rejects if tool call exceeds timeout', async () => {
    const timer = createPausableTimer();
    const execute = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 10_000)),
    );

    const wrapped = wrapWithPausableTimeout(execute, timer, 1000);
    const promise = wrapped({});

    vi.advanceTimersByTime(1100);

    await expect(promise).rejects.toThrow('Tool call timed out after 1000ms');
    expect(timer.getPausedAt()).toBeNull();
  });
});
