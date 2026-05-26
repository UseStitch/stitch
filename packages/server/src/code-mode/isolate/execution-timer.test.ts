import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test';

import {
  createAbortRace,
  createExecutionTimeoutRace,
  createPausableTimer,
  wrapWithPausableTimeout,
} from '@/code-mode/isolate/execution-timer.js';

describe('createPausableTimer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('reports elapsed time when not paused', () => {
    jest.setSystemTime(0);
    const timer = createPausableTimer();
    const startedAt = Date.now();

    jest.setSystemTime(500);

    expect(timer.getElapsed(startedAt)).toBe(500);
  });

  test('pausing stops elapsed time accumulation', () => {
    jest.setSystemTime(0);
    const timer = createPausableTimer();
    const startedAt = Date.now();

    jest.setSystemTime(200);
    timer.pause();
    jest.setSystemTime(500);

    expect(timer.getElapsed(startedAt)).toBe(200);
  });

  test('resuming resumes elapsed time accumulation', () => {
    jest.setSystemTime(0);
    const timer = createPausableTimer();
    const startedAt = Date.now();

    jest.setSystemTime(200);
    timer.pause();
    jest.setSystemTime(500);
    timer.resume();
    jest.setSystemTime(600);

    expect(timer.getElapsed(startedAt)).toBe(300);
  });

  test('multiple pause/resume cycles accumulate correctly', () => {
    jest.setSystemTime(0);
    const timer = createPausableTimer();
    const startedAt = Date.now();

    jest.setSystemTime(100);
    timer.pause();
    jest.setSystemTime(300);
    timer.resume();
    jest.setSystemTime(450);
    timer.pause();
    jest.setSystemTime(950);
    timer.resume();
    jest.setSystemTime(1000);

    expect(timer.getElapsed(startedAt)).toBe(300);
    expect(timer.getTotalPausedMs()).toBe(700);
  });

  test('getPausedAt returns null when not paused', () => {
    const timer = createPausableTimer();
    expect(timer.getPausedAt()).toBeNull();
  });

  test('getPausedAt returns timestamp when paused', () => {
    jest.setSystemTime(1000);
    const timer = createPausableTimer();
    timer.pause();
    expect(timer.getPausedAt()).toBe(1000);
  });

  test('double pause is a no-op', () => {
    jest.setSystemTime(0);
    const timer = createPausableTimer();
    const startedAt = Date.now();

    timer.pause();
    const firstPausedAt = timer.getPausedAt();
    jest.setSystemTime(100);
    timer.pause();

    expect(timer.getPausedAt()).toBe(firstPausedAt);
    expect(timer.getElapsed(startedAt)).toBe(0);
  });

  test('double resume is a no-op', () => {
    jest.setSystemTime(0);
    const timer = createPausableTimer();
    const startedAt = Date.now();

    jest.setSystemTime(100);
    timer.pause();
    jest.setSystemTime(300);
    timer.resume();
    timer.resume();
    jest.setSystemTime(350);

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

    const caught = await createAbortRace(controller.signal, 'already aborted')!.catch((e) => e);
    expect(caught).toSatisfy((e: unknown) => e instanceof Error && e.message === 'already aborted');
  });

  test('rejects when signal is aborted', async () => {
    const controller = new AbortController();
    const promise = createAbortRace(controller.signal, 'was aborted');

    controller.abort();
    const caught = await promise!.catch((e) => e);
    expect(caught).toSatisfy((e: unknown) => e instanceof Error && e.message === 'was aborted');
  });
});

describe('createExecutionTimeoutRace', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('rejects after timeout elapses', async () => {
    jest.useFakeTimers({ now: 0 });
    const timer = createPausableTimer();
    const startedAt = Date.now();
    const race = createExecutionTimeoutRace(timer, startedAt, 1000);

    const rejection = race.promise.catch((e) => e);
    jest.advanceTimersByTime(1100);
    const caught = await rejection;

    expect(caught).toSatisfy(
      (e: unknown) => e instanceof Error && e.message.includes('timed out after 1000ms'),
    );
    expect(race.isTimedOut()).toBe(true);
    race.cleanup();
  });

  test('does not reject before timeout', () => {
    jest.useFakeTimers({ now: 0 });
    const timer = createPausableTimer();
    const startedAt = Date.now();
    const race = createExecutionTimeoutRace(timer, startedAt, 1000);

    jest.advanceTimersByTime(499);
    expect(race.isTimedOut()).toBe(false);

    race.cleanup();
  });

  test('cleanup prevents rejection', () => {
    jest.useFakeTimers({ now: 0 });
    const timer = createPausableTimer();
    const startedAt = Date.now();
    const race = createExecutionTimeoutRace(timer, startedAt, 1000);

    race.cleanup();
    jest.advanceTimersByTime(2000);
    expect(race.isTimedOut()).toBe(false);
  });
});

describe('wrapWithPausableTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('pauses timer during execution and resumes after', async () => {
    const timer = createPausableTimer();
    const execute = mock(() => Promise.resolve('result'));

    const wrapped = wrapWithPausableTimeout(execute, timer, 5000);
    const promise = wrapped({ test: true });

    expect(timer.getPausedAt()).not.toBeNull();

    const result = await promise;

    expect(result).toBe('result');
    expect(timer.getPausedAt()).toBeNull();
  });

  test('resumes timer even on execution failure', async () => {
    const timer = createPausableTimer();
    const execute = mock(() => Promise.reject(new Error('failed')));

    const wrapped = wrapWithPausableTimeout(execute, timer, 5000);
    const caught = await wrapped({}).catch((e) => e);

    expect(caught).toSatisfy((e: unknown) => e instanceof Error && e.message === 'failed');
    expect(timer.getPausedAt()).toBeNull();
  });

  test('rejects if tool call exceeds timeout', async () => {
    const timer = createPausableTimer();
    const execute = mock(() => new Promise<never>(() => {}));

    const wrapped = wrapWithPausableTimeout(execute, timer, 1000);
    const rejection = wrapped({}).catch((e) => e);

    jest.advanceTimersByTime(1000);
    const caught = await rejection;

    expect(caught).toSatisfy(
      (e: unknown) => e instanceof Error && e.message === 'Tool call timed out after 1000ms',
    );
    expect(timer.getPausedAt()).toBeNull();
  });
});
