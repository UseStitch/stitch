import { describe, expect, test } from 'bun:test';

import { parseLiquidUiSpec } from './parse';

describe('parseLiquidUiSpec', () => {
  test('returns parsed spec for valid input', () => {
    const result = parseLiquidUiSpec({
      root: 'n1',
      nodes: [{ id: 'n1', component: 'Text', text: 'Hello', variant: 'body' }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.root).toBe('n1');
  });

  test('returns structured error for invalid input', () => {
    const result = parseLiquidUiSpec({ root: 'missing', nodes: [] });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_spec');
      expect(result.error.availableComponents).toContain('Chart');
    }
  });
});
