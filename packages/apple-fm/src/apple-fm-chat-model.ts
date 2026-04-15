import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
  SharedV3Warning,
} from '@ai-sdk/provider';

import { convertPromptToMessages } from './apple-fm-prompt.js';
import * as Native from './apple-fm-native.js';

const DEBUG = process.env.APPLE_FM_DEBUG === '1' || process.env.APPLE_FM_DEBUG === 'true';

function log(...args: unknown[]) {
  if (DEBUG) {
    console.log('[apple-fm][model]', ...args);
  }
}

/**
 * Apple FM has a hard 4096 token context window.
 * ~1 token ≈ 3-4 chars in English.
 * We budget: ~1500 tokens for system, ~1500 for prompt+history, ~1000 for response.
 */
const MAX_SYSTEM_CHARS = 4500;
const MAX_TOTAL_INPUT_CHARS = 10000;

export class AppleFMChatLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = 'v3' as const;
  readonly provider = 'apple-fm';
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  constructor(modelId: string) {
    this.modelId = modelId;
  }

  async doGenerate(options: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
    const warnings = this.buildWarnings(options);

    // Tools are not supported — Apple FM's 3B on-device model has a 4096 token
    // context window that cannot fit Stitch's tool definitions and still leave
    // room for a useful response. We drop them and generate text-only.
    if (options.tools && options.tools.length > 0) {
      warnings.push({ type: 'unsupported', feature: 'tools' });
    }

    const trimmedPrompt = trimPromptForContextWindow(options.prompt);
    const messages = convertPromptToMessages(trimmedPrompt);

    log('=== doGenerate() ===');
    log('original prompt messages:', options.prompt.length, '-> trimmed:', trimmedPrompt.length);
    log('converted messages:', messages.length);
    log('tools dropped:', options.tools?.length ?? 0);
    log('responseFormat:', options.responseFormat?.type);

    const result = await Native.generate({
      messages,
      temperature: options.temperature,
      maxTokens: options.maxOutputTokens,
      stopAfterToolCalls: true,
    });

    const content: LanguageModelV3Content[] = [];

    if (result.text) {
      content.push({ type: 'text', text: result.text });
    }

    if (result.object && !result.text) {
      content.push({ type: 'text', text: JSON.stringify(result.object) });
    }

    return {
      content,
      finishReason: {
        unified: 'stop',
        raw: undefined,
      },
      usage: {
        inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: undefined, text: undefined, reasoning: undefined },
      },
      warnings,
    };
  }

  async doStream(options: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
    const warnings = this.buildWarnings(options);

    if (options.tools && options.tools.length > 0) {
      warnings.push({ type: 'unsupported', feature: 'tools' });
    }

    const trimmedPrompt = trimPromptForContextWindow(options.prompt);
    const messages = convertPromptToMessages(trimmedPrompt);

    log('=== doStream() ===');
    log('original prompt messages:', options.prompt.length, '-> trimmed:', trimmedPrompt.length);
    log('converted messages:', messages.length);
    log('tools dropped:', options.tools?.length ?? 0);

    const nativeStream = Native.stream({
      messages,
      temperature: options.temperature,
      maxTokens: options.maxOutputTokens,
      stopAfterToolCalls: true,
    });

    const textId = crypto.randomUUID();

    const stream = new ReadableStream<LanguageModelV3StreamPart>({
      async start(controller) {
        controller.enqueue({ type: 'stream-start', warnings });
        let textStarted = false;

        try {
          for await (const event of nativeStream) {
            if (event.type === 'text') {
              if (!textStarted) {
                controller.enqueue({ type: 'text-start', id: textId });
                textStarted = true;
              }
              controller.enqueue({ type: 'text-delta', id: textId, delta: event.text });
            }
          }

          if (textStarted) {
            controller.enqueue({ type: 'text-end', id: textId });
          }

          controller.enqueue({ type: 'response-metadata', modelId: 'default' });

          controller.enqueue({
            type: 'finish',
            finishReason: {
              unified: 'stop',
              raw: undefined,
            },
            usage: {
              inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
              outputTokens: { total: undefined, text: undefined, reasoning: undefined },
            },
          });

          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return { stream };
  }

  private buildWarnings(options: LanguageModelV3CallOptions): SharedV3Warning[] {
    const warnings: SharedV3Warning[] = [];

    if (options.topP !== undefined) {
      warnings.push({ type: 'unsupported', feature: 'topP' });
    }
    if (options.topK !== undefined) {
      warnings.push({ type: 'unsupported', feature: 'topK' });
    }
    if (options.frequencyPenalty !== undefined) {
      warnings.push({ type: 'unsupported', feature: 'frequencyPenalty' });
    }
    if (options.presencePenalty !== undefined) {
      warnings.push({ type: 'unsupported', feature: 'presencePenalty' });
    }
    if (options.stopSequences && options.stopSequences.length > 0) {
      warnings.push({ type: 'unsupported', feature: 'stopSequences' });
    }
    if (options.seed !== undefined) {
      warnings.push({ type: 'unsupported', feature: 'seed' });
    }

    return warnings;
  }
}

/**
 * Trims the AI SDK prompt to fit within Apple FM's 4096 token context window.
 *
 * Strategy:
 * 1. Truncate system messages to MAX_SYSTEM_CHARS
 * 2. Keep only the last user message + optionally one assistant message for context
 * 3. Drop tool-result and tool-call messages entirely
 * 4. Enforce MAX_TOTAL_INPUT_CHARS across all remaining messages
 */
function trimPromptForContextWindow(
  prompt: LanguageModelV3CallOptions['prompt'],
): LanguageModelV3CallOptions['prompt'] {
  const result: LanguageModelV3CallOptions['prompt'] = [];
  let totalChars = 0;

  // Pass 1: Collect and trim system messages
  for (const msg of prompt) {
    if (msg.role === 'system') {
      let content = msg.content;
      if (content.length > MAX_SYSTEM_CHARS) {
        log(`Trimming system message from ${content.length} to ${MAX_SYSTEM_CHARS} chars`);
        content = content.slice(0, MAX_SYSTEM_CHARS) + '\n[Truncated]';
      }
      result.push({ ...msg, content });
      totalChars += content.length;
    }
  }

  // Pass 2: Collect non-system messages, keeping only recent context
  // Skip tool-related messages as we don't support tools
  const nonSystemMessages = prompt.filter(
    (msg) => msg.role !== 'system' && msg.role !== 'tool',
  );

  // Filter out assistant messages that only contain tool-calls (no text)
  const relevantMessages = nonSystemMessages.filter((msg) => {
    if (msg.role === 'assistant') {
      const hasText = msg.content.some(
        (part) => part.type === 'text' && part.text.trim().length > 0,
      );
      if (!hasText) return false;
    }
    return true;
  });

  // Keep the last few messages that fit in the budget
  const remainingBudget = MAX_TOTAL_INPUT_CHARS - totalChars;
  const keptMessages: typeof relevantMessages = [];
  let usedChars = 0;

  for (let i = relevantMessages.length - 1; i >= 0; i--) {
    const msg = relevantMessages[i];
    const msgChars = estimateMessageChars(msg);
    if (usedChars + msgChars > remainingBudget && keptMessages.length > 0) {
      break;
    }
    keptMessages.unshift(msg);
    usedChars += msgChars;
  }

  result.push(...keptMessages);

  log(
    `Trimmed prompt: ${prompt.length} messages -> ${result.length} messages, ~${totalChars + usedChars} chars`,
  );

  return result;
}

function estimateMessageChars(
  msg: LanguageModelV3CallOptions['prompt'][number],
): number {
  switch (msg.role) {
    case 'system':
      return msg.content.length;
    case 'user':
      return msg.content.reduce((sum, part) => {
        if (part.type === 'text') return sum + part.text.length;
        return sum;
      }, 0);
    case 'assistant':
      return msg.content.reduce((sum, part) => {
        if (part.type === 'text') return sum + part.text.length;
        if (part.type === 'reasoning') return sum + part.text.length;
        return sum;
      }, 0);
    case 'tool':
      return 0;
    default:
      return 0;
  }
}
