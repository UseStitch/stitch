import { describe, expect, test } from 'bun:test';

import { computeAudioLevel } from './use-stt.js';

describe('computeAudioLevel', () => {
  test('returns 0 for an empty frame', () => {
    expect(computeAudioLevel(new Float32Array(0))).toBe(0);
  });

  test('returns 0 for silence', () => {
    expect(computeAudioLevel(new Float32Array([0, 0, 0, 0]))).toBe(0);
  });

  test('scales RMS into the meter range and clamps at 1', () => {
    // Full-scale signal: RMS = 1, scaled by 3 then clamped to 1.
    expect(computeAudioLevel(new Float32Array([1, -1, 1, -1]))).toBe(1);
  });

  test('produces a proportional level for quiet speech', () => {
    // RMS of 0.1 → 0.3 after the x3 scale.
    const frame = new Float32Array([0.1, -0.1, 0.1, -0.1]);
    expect(computeAudioLevel(frame)).toBeCloseTo(0.3, 5);
  });
});
