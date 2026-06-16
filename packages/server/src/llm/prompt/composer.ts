import type { ModelMessage } from 'ai';

/**
 * PromptComposer — handles splicing prompt fragments into the layered system messages.
 *
 * The system message layout (produced by buildHistoryMessages) is:
 *   [0] static   — identity, base prompt, enforcement, liquidUI
 *   [1] semiStatic — env, user prompt (+ tool/skill fragments appended here)
 *   [2] dynamic  — memory, todos (+ toolset instructions appended here)
 *
 * This module enforces the layered prompt invariants in one place so that
 * neither the runner nor the assembler need to know about message indices.
 */

type PromptLayer = 'semiStatic' | 'dynamic';

function getStringContent(message: ModelMessage): string {
  return typeof message.content === 'string' ? message.content : '';
}

export class PromptComposer {
  private readonly fragments: Array<{ layer: PromptLayer; content: string }> = [];

  /** Add a fragment to the semi-static layer (index 1). */
  semiStatic(content: string): this {
    if (content) this.fragments.push({ layer: 'semiStatic', content });
    return this;
  }

  /** Add a fragment to the dynamic layer (last system message). */
  dynamic(content: string): this {
    if (content) this.fragments.push({ layer: 'dynamic', content });
    return this;
  }

  /**
   * Apply all registered fragments to the given messages array.
   * Returns a new array (does not mutate the input).
   */
  compose(messages: ModelMessage[]): ModelMessage[] {
    if (this.fragments.length === 0) return messages;

    const result = [...messages];
    const semiStaticFragments = this.fragments
      .filter((f) => f.layer === 'semiStatic')
      .map((f) => f.content);
    const dynamicFragments = this.fragments
      .filter((f) => f.layer === 'dynamic')
      .map((f) => f.content);

    if (semiStaticFragments.length > 0 && result.length > 0) {
      const semiStaticIndex = result.findIndex((msg, i) => i > 0 && msg.role === 'system');
      const targetIndex = semiStaticIndex !== -1 ? semiStaticIndex : 0;
      const existing = getStringContent(result[targetIndex]);
      result[targetIndex] = {
        role: 'system',
        content: `${existing}\n\n${semiStaticFragments.join('\n\n')}`,
      };
    }

    if (dynamicFragments.length > 0 && result.length > 0) {
      // Find the last system message (dynamic layer)
      let dynamicIndex = -1;
      for (let i = result.length - 1; i >= 0; i--) {
        if (result[i].role === 'system') {
          dynamicIndex = i;
          break;
        }
      }
      if (dynamicIndex !== -1) {
        const existing = getStringContent(result[dynamicIndex]);
        result[dynamicIndex] = {
          role: 'system',
          content: `${existing}\n\n${dynamicFragments.join('\n\n')}`,
        };
      }
    }

    return result;
  }
}
