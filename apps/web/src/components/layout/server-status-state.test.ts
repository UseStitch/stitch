import { describe, expect, it } from 'bun:test';

import { formatEventBusSubtitle, toEventBusState, toServerState, worstState } from './server-status-state';

describe('toServerState', () => {
  it('stays pending before the first health result so launch does not flash red', () => {
    expect(toServerState(undefined)).toBe('pending');
  });

  it('maps a known health result', () => {
    expect(toServerState(true)).toBe('ok');
    expect(toServerState(false)).toBe('down');
  });
});

describe('toEventBusState', () => {
  it('is only ok while connected', () => {
    expect(toEventBusState('connected')).toBe('ok');
    expect(toEventBusState('connecting')).toBe('pending');
    expect(toEventBusState('reconnecting')).toBe('pending');
  });
});

describe('worstState', () => {
  it('prefers down over pending', () => {
    expect(worstState('pending', 'down')).toBe('down');
  });

  it('prefers pending over ok', () => {
    expect(worstState('ok', 'pending')).toBe('pending');
  });

  it('is ok only when every input is ok', () => {
    expect(worstState('ok', 'ok')).toBe('ok');
  });
});

describe('formatEventBusSubtitle', () => {
  it('reports connecting before any heartbeat has arrived', () => {
    expect(formatEventBusSubtitle(null)).toBe('Connecting');
  });

  it('reports reconnecting with the last heartbeat age', () => {
    const heartbeat = new Date(Date.now() - 30_000);
    expect(formatEventBusSubtitle(heartbeat)).toBe('Reconnecting; last heartbeat 30s ago');
  });
});
