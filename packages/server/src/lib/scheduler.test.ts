import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';

import * as Scheduler from '@/lib/scheduler.js';

describe('Scheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Scheduler.cancelAll();
  });

  afterEach(() => {
    Scheduler.cancelAll();
    jest.useRealTimers();
  });

  describe('scheduleRecurring', () => {
    test('invokes callback on each interval tick', () => {
      let count = 0;
      Scheduler.scheduleRecurring('recurring1', 500, () => { count++; });

      jest.advanceTimersByTime(1500);

      expect(count).toBe(3);
    });

    test('invokes callback immediately when immediate option is true', () => {
      let count = 0;
      Scheduler.scheduleRecurring('recurring1', 500, () => { count++; }, { immediate: true });

      expect(count).toBe(1);
    });

    test('still invokes callback on interval ticks when immediate is true', () => {
      let count = 0;
      Scheduler.scheduleRecurring('recurring1', 500, () => { count++; }, { immediate: true });

      jest.advanceTimersByTime(1500);

      expect(count).toBe(4);
    });

    test('does not invoke callback immediately when immediate option is false', () => {
      let count = 0;
      Scheduler.scheduleRecurring('recurring1', 500, () => { count++; }, { immediate: false });

      expect(count).toBe(0);
    });

    test('replaces an existing task with the same id', () => {
      let firstCount = 0;
      let secondCount = 0;

      Scheduler.scheduleRecurring('recurring1', 500, () => { firstCount++; });
      Scheduler.scheduleRecurring('recurring1', 500, () => { secondCount++; });

      jest.advanceTimersByTime(500);

      expect(firstCount).toBe(0);
      expect(secondCount).toBe(1);
    });
  });

  describe('cancelAll', () => {
    test('prevents all callbacks from firing after cancellation', () => {
      let count1 = 0;
      let count2 = 0;
      Scheduler.scheduleRecurring('task1', 1000, () => { count1++; });
      Scheduler.scheduleRecurring('task2', 500, () => { count2++; });

      Scheduler.cancelAll();
      jest.advanceTimersByTime(1500);

      expect(count1).toBe(0);
      expect(count2).toBe(0);
    });
  });
});
