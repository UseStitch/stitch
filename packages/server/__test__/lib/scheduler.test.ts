import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { Scheduler } from '../../src/lib/scheduler.js';

describe('Scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Scheduler.cancelAll();
  });

  afterEach(() => {
    Scheduler.cancelAll();
    vi.useRealTimers();
  });

  describe('schedule', () => {
    test('invokes callback after the delay', async () => {
      const cb = vi.fn();
      Scheduler.schedule('task1', 1000, cb);

      await vi.advanceTimersByTimeAsync(1000);

      expect(cb).toHaveBeenCalledOnce();
    });

    test('removes task from registry after it fires', async () => {
      Scheduler.schedule('task1', 500, () => {});

      await vi.advanceTimersByTimeAsync(500);

      expect(Scheduler.has('task1')).toBe(false);
    });

    test('cancels an existing task with the same id before scheduling', async () => {
      const first = vi.fn();
      const second = vi.fn();

      Scheduler.schedule('task1', 1000, first);
      Scheduler.schedule('task1', 1000, second);

      await vi.advanceTimersByTimeAsync(1000);

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });
  });

  describe('scheduleRecurring', () => {
    test('invokes callback on each interval tick', async () => {
      const cb = vi.fn();
      Scheduler.scheduleRecurring('recurring1', 500, cb);

      await vi.advanceTimersByTimeAsync(1500);

      expect(cb).toHaveBeenCalledTimes(3);
    });

    test('keeps task registered after firing', async () => {
      Scheduler.scheduleRecurring('recurring1', 500, () => {});

      await vi.advanceTimersByTimeAsync(1500);

      expect(Scheduler.has('recurring1')).toBe(true);
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
  });

  describe('cancel', () => {
    test('returns false when task does not exist', () => {
      expect(Scheduler.cancel('nonexistent')).toBe(false);
    });

    test('prevents a one-off callback from firing after cancellation', async () => {
      const cb = vi.fn();
      Scheduler.schedule('task1', 1000, cb);
      Scheduler.cancel('task1');

      await vi.advanceTimersByTimeAsync(1000);

      expect(cb).not.toHaveBeenCalled();
    });

    test('stops a recurring callback from firing after cancellation', async () => {
      const cb = vi.fn();
      Scheduler.scheduleRecurring('recurring1', 500, cb);
      Scheduler.cancel('recurring1');

      await vi.advanceTimersByTimeAsync(1500);

      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('cancelAll', () => {
    test('prevents all callbacks from firing after cancellation', async () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      Scheduler.schedule('task1', 1000, cb1);
      Scheduler.scheduleRecurring('task2', 500, cb2);

      Scheduler.cancelAll();
      await vi.advanceTimersByTimeAsync(1500);

      expect(cb1).not.toHaveBeenCalled();
      expect(cb2).not.toHaveBeenCalled();
    });
  });

  describe('ids', () => {
    test('returns empty array when no tasks are registered', () => {
      expect(Scheduler.ids()).toEqual([]);
    });

    test('returns ids of all active tasks', () => {
      Scheduler.schedule('task1', 1000, () => {});
      Scheduler.scheduleRecurring('task2', 500, () => {});

      expect(Scheduler.ids()).toEqual(expect.arrayContaining(['task1', 'task2']));
      expect(Scheduler.ids()).toHaveLength(2);
    });
  });
});
