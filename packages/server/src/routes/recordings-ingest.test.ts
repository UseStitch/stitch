import { serve } from '@hono/node-server';
import { createNodeWebSocket } from '@hono/node-ws';
import { afterEach, expect, test } from 'bun:test';
import { Hono } from 'hono';

import type { RecordingAudioChunkPayload } from '@stitch/shared/chat/realtime';

import * as Events from '@/lib/events.js';
import { createRecordingsIngestRouter } from '@/routes/recordings-ingest.js';

type TestServer = ReturnType<typeof serve>;

const servers: TestServer[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    server.close();
  }
});

async function createTestServer(): Promise<{ url: string; server: TestServer }> {
  const app = new Hono();
  const nodeWebSocket = createNodeWebSocket({ app });
  app.route('/recordings', createRecordingsIngestRouter(nodeWebSocket.upgradeWebSocket));

  let server!: TestServer;
  const port = await new Promise<number>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
      resolve(info.port);
    });
    nodeWebSocket.injectWebSocket(server);
  });
  servers.push(server);

  return { url: `ws://127.0.0.1:${port}/recordings/ingest`, server };
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket failed to open')), {
      once: true,
    });
  });
}

test('emits recording audio chunks from WebSocket ingest messages', async () => {
  const { url } = await createTestServer();
  const payloadPromise = new Promise<RecordingAudioChunkPayload>((resolve) => {
    const unsubscribe = Events.on('recording-audio-chunk', (payload) => {
      unsubscribe();
      resolve(payload);
    });
  });

  const ws = new WebSocket(url);
  await waitForOpen(ws);

  ws.send(
    JSON.stringify({
      type: 'start',
      recordingId: 'rec_test',
      audioChunkConfig: { encoding: 'f32le', sampleRateHz: 16_000 },
    }),
  );
  ws.send(
    JSON.stringify({
      type: 'chunk',
      recordingId: 'rec_test',
      source: 'mic',
      samplesB64: 'AAAA',
      sampleRateHz: 16_000,
      numSamples: 512,
    }),
  );

  expect(payloadPromise).resolves.toEqual({
    recordingId: 'rec_test',
    source: 'mic',
    samplesB64: 'AAAA',
    sampleRateHz: 16_000,
    numSamples: 512,
  });

  ws.close();
});

test('rejects chunks that arrive before a start message', async () => {
  const { url } = await createTestServer();

  let emitted = false;
  const unsubscribe = Events.on('recording-audio-chunk', () => {
    emitted = true;
  });

  const ws = new WebSocket(url);
  await waitForOpen(ws);

  const closePromise = new Promise<void>((resolve) => {
    ws.addEventListener('close', () => resolve(), { once: true });
  });

  ws.send(
    JSON.stringify({
      type: 'chunk',
      recordingId: 'rec_test',
      source: 'mic',
      samplesB64: 'AAAA',
      sampleRateHz: 16_000,
      numSamples: 512,
    }),
  );

  await closePromise;
  unsubscribe();

  expect(emitted).toBe(false);
});
