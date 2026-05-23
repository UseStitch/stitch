import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { InteractionBroker } from '@/interactions/broker.js';

describe('InteractionBroker', () => {
  let broker: InteractionBroker;

  beforeEach(() => {
    broker = new InteractionBroker();
  });

  afterEach(() => {
    broker.clear();
    vi.useRealTimers();
  });

  test('resolves a pending interaction', async () => {
    const promise = broker.wait<string>({
      id: 'permres_1',
      kind: 'permission',
      sessionId: 'ses_1',
    });

    expect(broker.resolve('permres_1', 'allow')).toBe(true);
    await expect(promise).resolves.toBe('allow');
  });

  test('rejects a pending interaction', async () => {
    const promise = broker.wait<string>({
      id: 'quest_1',
      kind: 'question',
      sessionId: 'ses_1',
    });

    expect(broker.reject('quest_1', new Error('No'))).toBe(true);
    await expect(promise).rejects.toThrow('No');
  });

  test('abort signal rejects and cleans up', async () => {
    const controller = new AbortController();
    const promise = broker.wait<string>({
      id: 'quest_2',
      kind: 'question',
      sessionId: 'ses_1',
      abortSignal: controller.signal,
      abortError: () => new Error('Aborted'),
    });

    controller.abort();

    await expect(promise).rejects.toThrow('Aborted');
    expect(broker.resolve('quest_2', 'answer')).toBe(false);
  });

  test('aborts only matching session interactions', async () => {
    const first = broker.wait<string>({ id: 'a', kind: 'question', sessionId: 'ses_1' });
    const second = broker.wait<string>({ id: 'b', kind: 'question', sessionId: 'ses_2' });

    const aborted = broker.abortSession({
      sessionId: 'ses_1',
      error: new Error('Session aborted'),
    });

    expect(aborted.map((entry) => entry.id)).toEqual(['a']);
    await expect(first).rejects.toThrow('Session aborted');

    expect(broker.resolve('b', 'ok')).toBe(true);
    await expect(second).resolves.toBe('ok');
  });

  test('timeout resolves with configured decision', async () => {
    vi.useFakeTimers();

    const promise = broker.wait<string>({
      id: 'doom_loop:ses_1',
      kind: 'doom_loop',
      sessionId: 'ses_1',
      timeoutMs: 100,
      onTimeout: () => 'stop',
    });

    await vi.advanceTimersByTimeAsync(100);
    await expect(promise).resolves.toBe('stop');
  });

  test('duplicate wait resolves previous interaction with configured decision', async () => {
    const first = broker.wait<string>({
      id: 'doom_loop:ses_1',
      kind: 'doom_loop',
      sessionId: 'ses_1',
      onDuplicate: () => 'stop',
    });
    const second = broker.wait<string>({
      id: 'doom_loop:ses_1',
      kind: 'doom_loop',
      sessionId: 'ses_1',
      onDuplicate: () => 'stop',
    });

    await expect(first).resolves.toBe('stop');
    expect(broker.resolve('doom_loop:ses_1', 'continue')).toBe(true);
    await expect(second).resolves.toBe('continue');
  });
});
