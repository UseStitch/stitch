import type { ModelMessage } from 'ai';

type PromptLayer = 'semiStatic' | 'dynamic';

function getStringContent(message: ModelMessage): string {
  return typeof message.content === 'string' ? message.content : '';
}

export class PromptComposer {
  private readonly fragments: Array<{ layer: PromptLayer; content: string }> = [];

  add(layer: PromptLayer, content: string): this {
    if (content) this.fragments.push({ layer, content });
    return this;
  }

  compose(messages: ModelMessage[]): ModelMessage[] {
    if (this.fragments.length === 0) return messages;

    const result = [...messages];
    const semiStaticFragments = this.fragments.filter((f) => f.layer === 'semiStatic').map((f) => f.content);
    const dynamicFragments = this.fragments.filter((f) => f.layer === 'dynamic').map((f) => f.content);

    if (semiStaticFragments.length > 0 && result.length > 0) {
      const semiStaticIndex = result.findIndex((msg, i) => i > 0 && msg.role === 'system');
      const targetIndex = semiStaticIndex !== -1 ? semiStaticIndex : 0;
      const existing = getStringContent(result[targetIndex]);
      result[targetIndex] = { role: 'system', content: `${existing}\n\n${semiStaticFragments.join('\n\n')}` };
    }

    if (dynamicFragments.length > 0 && result.length > 0) {
      let dynamicIndex = -1;
      for (let i = result.length - 1; i >= 0; i--) {
        if (result[i].role === 'system') {
          dynamicIndex = i;
          break;
        }
      }
      if (dynamicIndex !== -1) {
        const existing = getStringContent(result[dynamicIndex]);
        result[dynamicIndex] = { role: 'system', content: `${existing}\n\n${dynamicFragments.join('\n\n')}` };
      }
    }

    return result;
  }
}
