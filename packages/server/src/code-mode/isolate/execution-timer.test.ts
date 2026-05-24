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

    jest.setSystemTime(100); // 100ms active
    timer.pause();
    jest.setSystemTime(300); // 200ms paused
    timer.resume();
    jest.setSystemTime(450); // 150ms active
    timer.pause();
    jest.setSystemTime(950); // 500ms paused
    timer.resume();
    jest.setSystemTime(1000); // 50ms active

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
    expect(caught).toSatisfy((e: unknown) => e instanceof Error && (e as Error).message === 'already aborted');
  });

  test('rejects when signal is aborted', async () => {
    const controller = new AbortController();
    const promise = createAbortRace(controller.signal, 'was aborted');

    controller.abort();
    const caught = await promise!.catch((e) => e);
    expect(caught).toSatisfy((e: unknown) => e instanceof Error && (e as Error).message === 'was aborted');
  });
});

describe('createExecutionTimeoutRace', () => {
  test('rejects after timeout elapses', async () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();
    const race = createExecutionTimeoutRace(timer, startedAt, 50);

    const caught = await race.promise.catch((e) => e);
    expect(caught).toSatisfy((e: unknown) => e instanceof Error && (e as Error).message.includes('timed out after 50ms'));
    expect(race.isTimedOut()).toBe(true);
    race.cleanup();
  }, 2000);

  test('does not reject before timeout', async () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();
    const race = createExecutionTimeoutRace(timer, startedAt, 500);

    await Bun.sleep(10);
    expect(race.isTimedOut()).toBe(false);

    race.cleanup();
  });

  test('cleanup prevents rejection', async () => {
    const timer = createPausableTimer();
    const startedAt = Date.now();
    const race = createExecutionTimeoutRace(timer, startedAt, 50);

    race.cleanup();
    await Bun.sleep(100);
    expect(race.isTimedOut()).toBe(false);
  });
});

describe('wrapWithPausableTimeout', () => {
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
    expect(caught).toSatisfy((e: unknown) => e instanceof Error && (e as Error).message === 'failed');
    expect(timer.getPausedAt()).toBeNull();
  });

  test('rejects if tool call exceeds timeout', async () => {
    const timer = createPausableTimer();
    const execute = mock(() => Bun.sleep(10_000));

    const wrapped = wrapWithPausableTimeout(execute, timer, 50);
    const caught = await wrapped({}).catch((e) => e);

    expect(caught).toSatisfy((e: unknown) => e instanceof Error && (e as Error).message === 'Tool call timed out after 50ms');
    expect(timer.getPausedAt()).toBeNull();
  }, 2000);
});
