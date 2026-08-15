import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { InteractionBroker } from '@/lib/interactions/broker.js';

describe('InteractionBroker', () => {
  let broker: InteractionBroker;

  beforeEach(() => {
    broker = new InteractionBroker();
  });

  afterEach(() => {
    broker.clear();
  });

  test('resolves a pending interaction', async () => {
    const promise = broker.wait<string>({ id: 'permres_1', kind: 'permission', sessionId: 'ses_1' });

    expect(broker.resolve('permres_1', 'allow')).toBe(true);
    expect(promise).resolves.toBe('allow');
  });

  test('rejects a pending interaction', async () => {
    const promise = broker.wait<string>({ id: 'quest_1', kind: 'question', sessionId: 'ses_1' });

    expect(broker.reject('quest_1', new Error('No'))).toBe(true);
    expect(promise).rejects.toThrow('No');
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

    expect(promise).rejects.toThrow('Aborted');
    expect(broker.resolve('quest_2', 'answer')).toBe(false);
  });

  test('aborts only matching session interactions', async () => {
    const first = broker.wait<string>({ id: 'a', kind: 'question', sessionId: 'ses_1' });
    const second = broker.wait<string>({ id: 'b', kind: 'question', sessionId: 'ses_2' });

    const aborted = broker.abortSession({ sessionId: 'ses_1', error: new Error('Session aborted') });

    expect(aborted.map((entry) => entry.id)).toEqual(['a']);
    expect(first).rejects.toThrow('Session aborted');

    expect(broker.resolve('b', 'ok')).toBe(true);
    expect(second).resolves.toBe('ok');
  });

  test('timeout resolves with configured decision', async () => {
    const promise = broker.wait<string>({
      id: 'doom_loop:ses_1',
      kind: 'doom_loop',
      sessionId: 'ses_1',
      timeoutMs: 10,
      onTimeout: () => 'stop',
    });

    await Bun.sleep(20);
    expect(promise).resolves.toBe('stop');
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

    expect(first).resolves.toBe('stop');
    expect(broker.resolve('doom_loop:ses_1', 'continue')).toBe(true);
    expect(second).resolves.toBe('continue');
  });

  test('deduplicates in-flight waits with identical dedupeKey', async () => {
    const first = broker.wait<string>({
      id: 'permres_1',
      kind: 'permission',
      sessionId: 'ses_1',
      dedupeKey: 'perm_read_file',
    });

    const second = broker.wait<string>({
      id: 'permres_2',
      kind: 'permission',
      sessionId: 'ses_1',
      dedupeKey: 'perm_read_file',
    });

    expect(broker.getDedupe('perm_read_file')).toBeDefined();

    broker.resolve('permres_1', 'allow');

    expect(first).resolves.toBe('allow');
    expect(second).resolves.toBe('allow');
  });

  test('stores payload and supports list filtering and get', async () => {
    void broker.wait<string, { toolName: string }>({
      id: 'permres_1',
      kind: 'permission',
      sessionId: 'ses_1',
      payload: { toolName: 'bash' },
    });

    void broker.wait<string, { toolName: string }>({
      id: 'doom_1',
      kind: 'doom_loop',
      sessionId: 'ses_1',
      payload: { toolName: 'read' },
    });

    void broker.wait<string>({ id: 'permres_2', kind: 'permission', sessionId: 'ses_2' });

    expect(broker.has('permres_1')).toBe(true);
    expect(broker.has('nonexistent')).toBe(false);

    const snapshot = broker.get<{ toolName: string }>('permres_1');
    expect(snapshot).toBeDefined();
    expect(snapshot?.payload).toEqual({ toolName: 'bash' });
    expect(typeof snapshot?.createdAt).toBe('number');

    const session1Interactions = broker.list({ sessionId: 'ses_1' });
    expect(session1Interactions.map((e) => e.id)).toEqual(['permres_1', 'doom_1']);

    const permissionInteractions = broker.list({ kind: 'permission' });
    expect(permissionInteractions.map((e) => e.id)).toEqual(['permres_1', 'permres_2']);
  });
});
