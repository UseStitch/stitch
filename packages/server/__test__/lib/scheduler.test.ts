import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';

import * as Scheduler from '@/lib/scheduler.js';

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Scheduler.cancelAll();
  });

  afterEach(() => {
    Scheduler.cancelAll();
    vi.useRealTimers();
  });

  describe('scheduleRecurring', () => {
    test('invokes callback on each interval tick', async () => {
      const cb = vi.fn();
      Scheduler.scheduleRecurring('recurring1', 500, cb);

      await vi.advanceTimersByTimeAsync(1500);

      expect(cb).toHaveBeenCalledTimes(3);
    });

    test('invokes callback immediately when immediate option is true', () => {
      const cb = vi.fn();
      Scheduler.scheduleRecurring('recurring1', 500, cb, { immediate: true });

      expect(cb).toHaveBeenCalledOnce();
    });

    test('still invokes callback on interval ticks when immediate is true', async () => {
      const cb = vi.fn();
      Scheduler.scheduleRecurring('recurring1', 500, cb, { immediate: true });

      await vi.advanceTimersByTimeAsync(1500);

      expect(cb).toHaveBeenCalledTimes(4);
    });

    test('does not invoke callback immediately when immediate option is false', () => {
      const cb = vi.fn();
      Scheduler.scheduleRecurring('recurring1', 500, cb, { immediate: false });

      expect(cb).not.toHaveBeenCalled();
    });

    test('replaces an existing task with the same id', async () => {
      const first = vi.fn();
      const second = vi.fn();

      Scheduler.scheduleRecurring('recurring1', 500, first);
      Scheduler.scheduleRecurring('recurring1', 500, second);

      await vi.advanceTimersByTimeAsync(500);

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  describe('cancelAll', () => {
    test('prevents all callbacks from firing after cancellation', async () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      Scheduler.scheduleRecurring('task1', 1000, cb1);
      Scheduler.scheduleRecurring('task2', 500, cb2);

      Scheduler.cancelAll();
      await vi.advanceTimersByTimeAsync(1500);

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
    });
  });
});
