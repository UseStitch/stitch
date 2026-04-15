import type { LanguageModelV3Prompt } from '@ai-sdk/provider';

import type { ChatMessage } from './apple-fm-types.js';

/**
 * Convert an AI SDK V3 prompt (message array) to the ChatMessage format
 * expected by the Apple FM native layer.
 */
export function convertPromptToMessages(prompt: LanguageModelV3Prompt): ChatMessage[] {
  const messages: ChatMessage[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case 'system':
        messages.push({ role: 'system', content: message.content });
        break;

      case 'user':
        messages.push({
          role: 'user',
          content: message.content
            .map((part) => {
              if (part.type === 'text') return part.text;
              return '';
            })
            .filter(Boolean)
            .join('\n'),
        });
        break;

      case 'assistant': {
        const textParts: string[] = [];
        const toolCalls: ChatMessage['tool_calls'] = [];

        for (const part of message.content) {
          switch (part.type) {
            case 'text':
              textParts.push(part.text);
              break;
            case 'reasoning':
              textParts.push(part.text);
              break;
            case 'tool-call':
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: typeof part.input === 'string' ? part.input : JSON.stringify(part.input),
                },
              });
              break;
          }
        }

        const msg: ChatMessage = {
          role: 'assistant',
          content: textParts.join('\n'),
        };

        if (toolCalls.length > 0) {
          msg.tool_calls = toolCalls;
        }

        messages.push(msg);
        break;
      }

      case 'tool': {
        const toolResults = message.content
          .filter((part) => part.type === 'tool-result')
          .map((part) => ({
            id: part.toolCallId,
            toolName: part.toolName,
            segments: [
              {
                type: 'text' as const,
                text: extractToolOutput(part.output),
              },
            ],
          }));

        messages.push({
          role: 'tool',
          content: JSON.stringify({ tool_calls: toolResults }),
        });
        break;
      }
    }
  }

  return messages;
}

function extractToolOutput(output: unknown): string {
  if (!output || typeof output !== 'object') return '';
  const o = output as { type: string; value: unknown };

  switch (o.type) {
    case 'text':
    case 'error-text':
      return typeof o.value === 'string' ? o.value : JSON.stringify(o.value);
    case 'json':
    case 'error-json':
      return JSON.stringify(o.value);
    case 'content':
      if (Array.isArray(o.value)) {
        return o.value
          .filter((v: { type: string }) => v.type === 'text')
          .map((v: { text: string }) => v.text)
          .join('\n');
      }
      return '';
    default:
      return JSON.stringify(output);
  }
}
