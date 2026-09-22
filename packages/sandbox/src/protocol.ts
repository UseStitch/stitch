import { z } from 'zod';

import type { SandboxLibrary, SandboxValue } from './types.js';

const sandboxValueSchema: z.ZodType<SandboxValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.null(),
    z.number(),
    z.string(),
    z.undefined(),
    z.array(sandboxValueSchema),
    z.record(z.string(), sandboxValueSchema),
  ]),
);

const sandboxLibrarySchema = z.object({
  specifier: z.string(),
  globalName: z.string().optional(),
  inject: z.boolean().optional(),
});

const workerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tool_call'), id: z.string(), name: z.string(), args: sandboxValueSchema }),
  z
    .object({ type: z.literal('complete'), result: sandboxValueSchema, logs: z.array(z.string()) })
    .refine((message) => Object.hasOwn(message, 'result')),
  z.object({ type: z.literal('error'), error: z.string(), logs: z.array(z.string()) }),
  z.object({ type: z.literal('memory_report'), rss: z.number().nonnegative() }),
]);

const hostMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('execute'), code: z.string() }),
  z
    .object({ type: z.literal('tool_result'), id: z.string(), result: sandboxValueSchema })
    .refine((message) => Object.hasOwn(message, 'result')),
  z.object({ type: z.literal('tool_error'), id: z.string(), error: z.string() }),
  z.object({
    type: z.literal('init'),
    toolNames: z.array(z.string()),
    libraries: z.record(z.string(), sandboxLibrarySchema),
    memoryReportIntervalMs: z.number().positive(),
  }),
]);

export type HostMessage =
  | { type: 'execute'; code: string }
  | { type: 'tool_result'; id: string; result: SandboxValue }
  | { type: 'tool_error'; id: string; error: string }
  | {
      type: 'init';
      toolNames: string[];
      libraries: { [name: string]: SandboxLibrary };
      memoryReportIntervalMs: number;
    };

export type WorkerMessage =
  | { type: 'tool_call'; id: string; name: string; args: SandboxValue }
  | { type: 'complete'; result: SandboxValue; logs: string[] }
  | { type: 'error'; error: string; logs: string[] }
  | { type: 'memory_report'; rss: number };

export function isWorkerMessage(message: SandboxValue): message is WorkerMessage {
  return workerMessageSchema.safeParse(message).success;
}

export function isHostMessage(message: SandboxValue): message is HostMessage {
  return hostMessageSchema.safeParse(message).success;
}

export function prepareHostMessageParser(): void {
  for (const message of [
    { type: 'execute', code: '' },
    { type: 'tool_result', id: '', result: undefined },
    { type: 'tool_error', id: '', error: '' },
    { type: 'init', toolNames: [], libraries: {}, memoryReportIntervalMs: 1 },
  ] satisfies SandboxValue[]) {
    isHostMessage(message);
  }
}
