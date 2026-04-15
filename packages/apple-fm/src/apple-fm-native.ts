import type { NativeBindings, ChatMessage, EphemeralTool, ModelAvailability } from './apple-fm-types.js';
import { getNativeModule } from './native-loader.js';

const DEBUG = process.env.APPLE_FM_DEBUG === '1' || process.env.APPLE_FM_DEBUG === 'true';

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log('[apple-fm][ts]', ...args);
  }
}

let native: NativeBindings | null = null;

function loadNative(): NativeBindings | null {
  if (native) return native;
  try {
    native = getNativeModule();
    return native;
  } catch (e) {
    log('Failed to load native module:', e);
    return null;
  }
}

/**
 * Returns true if Apple Foundation Models are available on this machine.
 * Checks platform, architecture, native addon loading, and runtime availability.
 */
export function isAvailable(): boolean {
  if (process.platform !== 'darwin') return false;
  if (process.arch !== 'arm64') return false;

  const n = loadNative();
  if (!n) return false;

  try {
    const availability = n.checkAvailability();
    return availability.available;
  } catch {
    return false;
  }
}

export function checkAvailability(): ModelAvailability {
  const n = loadNative();
  if (!n) {
    return {
      available: false,
      reason: `Apple FM native module not available (platform: ${process.platform}/${process.arch})`,
    };
  }
  return n.checkAvailability();
}

export async function generate(options: {
  messages: ChatMessage[];
  tools?: EphemeralTool[];
  schema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  stopAfterToolCalls?: boolean;
}): Promise<{ text: string; object?: unknown; toolCalls?: unknown[] }> {
  const n = loadNative();
  if (!n) throw new Error('Apple FM native module not available');

  const messagesJson = JSON.stringify(options.messages);

  log('=== generate() called ===');
  log('messages count:', options.messages.length);
  log('messages roles:', options.messages.map((m) => m.role).join(', '));
  log('messages JSON length:', messagesJson.length, 'chars');
  log('tools:', options.tools?.length ?? 0);
  log('schema:', options.schema ? 'yes' : 'no');
  log('temperature:', options.temperature);
  log('maxTokens:', options.maxTokens);

  // Log each message's content length for context window debugging
  for (const [i, msg] of options.messages.entries()) {
    const contentLen = msg.content?.length ?? 0;
    const toolCallsLen = msg.tool_calls?.length ?? 0;
    log(`  msg[${i}] role=${msg.role} content=${contentLen}chars toolCalls=${toolCallsLen}`);
  }

  let toolsJson: string | null = null;
  if (options.tools && options.tools.length > 0) {
    const toolSchemas = options.tools.map((tool, idx) => ({
      id: idx + 1,
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.jsonSchema,
    }));
    toolsJson = JSON.stringify(toolSchemas);

    n.setToolCallback((_err: Error | null, id: number, argsJson: string) => {
      const tool = options.tools![id - 1];
      if (!tool) {
        n.toolResult(id, '{}');
        return;
      }
      try {
        void tool.handler(JSON.parse(argsJson) as Record<string, unknown>).then(
          (result) => n.toolResult(id, JSON.stringify(result ?? null)),
          () => n.toolResult(id, '{}'),
        );
      } catch {
        n.toolResult(id, '{}');
      }
    });
  }

  let schemaJson: string | null = null;
  if (!options.tools && options.schema) {
    schemaJson = JSON.stringify(options.schema);
  }

  try {
    log('Calling native generateUnified...');
    const raw = await n.generateUnified(
      messagesJson,
      toolsJson,
      schemaJson,
      options.temperature,
      options.maxTokens,
      options.stopAfterToolCalls ?? true,
    );

    log('Native response length:', raw?.length ?? 0, 'chars');
    log('Native response preview:', raw?.substring(0, 300));

    if (raw?.startsWith('Error: ')) {
      const errorMsg = raw.slice(7);
      console.error('[apple-fm][ts] Native returned error:', errorMsg);
      throw new Error(errorMsg);
    }

    const parsed = JSON.parse(raw) as { text: string; object?: unknown; toolCalls?: unknown[] };
    log('Parsed result - text:', parsed.text?.length ?? 0, 'chars, toolCalls:', parsed.toolCalls?.length ?? 0);
    return parsed;
  } finally {
    if (options.tools && options.tools.length > 0) {
      n.clearToolCallback();
    }
  }
}

type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: Record<string, unknown> };

export function stream(options: {
  messages: ChatMessage[];
  tools?: EphemeralTool[];
  temperature?: number;
  maxTokens?: number;
  stopAfterToolCalls?: boolean;
}): AsyncIterableIterator<StreamEvent> {
  const n = loadNative();
  if (!n) throw new Error('Apple FM native module not available');

  const messagesJson = JSON.stringify(options.messages);

  log('=== stream() called ===');
  log('messages count:', options.messages.length);
  log('messages roles:', options.messages.map((m) => m.role).join(', '));
  log('messages JSON length:', messagesJson.length, 'chars');
  log('tools:', options.tools?.length ?? 0);

  // Log each message's content length for context window debugging
  for (const [i, msg] of options.messages.entries()) {
    const contentLen = msg.content?.length ?? 0;
    const toolCallsLen = msg.tool_calls?.length ?? 0;
    log(`  msg[${i}] role=${msg.role} content=${contentLen}chars toolCalls=${toolCallsLen}`);
  }

  let toolsJson: string | null = null;
  const collectedToolCalls: Array<{
    id: number;
    toolName: string;
    args: Record<string, unknown>;
  }> = [];

  if (options.tools && options.tools.length > 0) {
    const toolSchemas = options.tools.map((tool, idx) => ({
      id: idx + 1,
      name: tool.name,
      description: tool.description ?? '',
      parameters: tool.jsonSchema,
    }));
    toolsJson = JSON.stringify(toolSchemas);

    n.setToolCallback((_err: Error | null, id: number, argsJson: string) => {
      const tool = options.tools![id - 1];
      if (!tool) {
        n.toolResult(id, '{}');
        return;
      }
      try {
        const args = JSON.parse(argsJson) as Record<string, unknown>;
        collectedToolCalls.push({ id, toolName: tool.name, args });
        n.toolResult(id, '{}');
      } catch {
        n.toolResult(id, '{}');
      }
    });
  }

  const queue: StreamEvent[] = [];
  let done = false;
  let error: unknown = null;
  let pendingResolve: ((value: IteratorResult<StreamEvent>) => void) | null = null;
  let pendingReject: ((reason?: unknown) => void) | null = null;
  let generationComplete = false;

  const finish = () => {
    if (generationComplete) return;
    generationComplete = true;

    for (const call of collectedToolCalls) {
      const event: StreamEvent = {
        type: 'tool-call',
        toolCallId: `tool-call-${crypto.randomUUID()}`,
        toolName: call.toolName,
        args: call.args,
      };
      if (pendingResolve) {
        pendingResolve({ value: event, done: false });
        pendingResolve = null;
        pendingReject = null;
      } else {
        queue.push(event);
      }
    }

    done = true;
    if (options.tools && options.tools.length > 0) {
      n.clearToolCallback();
    }
    if (pendingResolve) {
      pendingResolve({ value: undefined as unknown as StreamEvent, done: true });
      pendingResolve = null;
      pendingReject = null;
    }
  };

  n.generateUnifiedStream(
    messagesJson,
    toolsJson,
    null,
    options.temperature,
    options.maxTokens,
    options.stopAfterToolCalls ?? true,
    (err: unknown, chunk?: string | null) => {
      if (err) {
        console.error('[apple-fm][ts][stream] Error from native:', err);
        error = err;
        done = true;
        if (pendingReject) {
          pendingReject(err);
          pendingResolve = null;
          pendingReject = null;
        }
        return;
      }

      if (chunk === null || chunk === '' || chunk === undefined) {
        log('[stream] End of stream signal received');
        finish();
        return;
      }

      const event: StreamEvent = { type: 'text', text: chunk };
      if (pendingResolve) {
        pendingResolve({ value: event, done: false });
        pendingResolve = null;
        pendingReject = null;
      } else {
        queue.push(event);
      }
    },
  );

  return {
    next(): Promise<IteratorResult<StreamEvent>> {
      if (queue.length > 0) {
        return Promise.resolve({ value: queue.shift()!, done: false });
      }
      if (done) {
        return Promise.resolve({ value: undefined as unknown as StreamEvent, done: true });
      }
      if (error) {
        return Promise.reject(error);
      }
      return new Promise<IteratorResult<StreamEvent>>((resolve, reject) => {
        pendingResolve = resolve;
        pendingReject = reject;
      });
    },
    return(): Promise<IteratorResult<StreamEvent>> {
      done = true;
      return Promise.resolve({ value: undefined as unknown as StreamEvent, done: true });
    },
    throw(err?: unknown): Promise<IteratorResult<StreamEvent>> {
      done = true;
      return Promise.reject(err);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
