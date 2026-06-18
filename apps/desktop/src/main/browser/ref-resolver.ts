import type { WebContents } from 'electron';

import type { RefEntry } from './types.js';
import { buildRefActionScript } from './scripts/ref-action.injected.js';

export class RefResolver {
  private refs = new Map<string, RefEntry>();

  constructor(private readonly getBrowser: () => Promise<WebContents>) {}

  setRefs(refs: Record<string, RefEntry>): void {
    this.refs = new Map(Object.entries(refs));
  }

  async runOnRef(ref: string, buildScript: (element: string) => string): Promise<unknown> {
    const result = await (
      await this.getBrowser()
    ).executeJavaScript(this.refActionScript(ref, (element) => buildScript(element)), true);
    return this.unwrapRefResult(ref, result);
  }

  async resolveRef(ref: string): Promise<{ x: number; y: number }> {
    const result = await (
      await this.getBrowser()
    ).executeJavaScript(
      this.refActionScript(
        ref,
        (element) =>
          `${element}.scrollIntoView({ block: 'center', inline: 'center' }); ${element}.focus?.(); return true;`,
      ),
      true,
    );
    return this.unwrapRefResult(ref, result) as { x: number; y: number };
  }

  async focusRef(ref: string, clear?: boolean): Promise<void> {
    const result = await (
      await this.getBrowser()
    ).executeJavaScript(
      this.refActionScript(
        ref,
        (element) => `
          ${element}.scrollIntoView({ block: 'center', inline: 'center' });
          ${element}.focus();
          if (${clear ? 'true' : 'false'} && 'value' in ${element}) {
            const valueSetter = Object.getOwnPropertyDescriptor(${element}.constructor.prototype, 'value')?.set;
            if (valueSetter) valueSetter.call(${element}, '');
            else ${element}.value = '';
            ${element}.dispatchEvent(new Event('input', { bubbles: true }));
            ${element}.dispatchEvent(new Event('change', { bubbles: true }));
          }
          return true;
        `,
      ),
      true,
    );
    this.unwrapRefResult(ref, result);
  }

  private refActionScript(ref: string, buildScript: (element: string) => string): string {
    const entry = this.refs.get(ref);
    if (!entry) throw new Error(`Unknown ref: ${ref}. Take a fresh browser_snapshot first.`);
    return buildRefActionScript(entry, buildScript);
  }

  private unwrapRefResult(ref: string, result: unknown): unknown {
    if (!result || typeof result !== 'object' || !('ok' in result)) {
      throw new Error(`Browser interaction on ${ref} did not return a valid result.`);
    }

    if (!(result as { ok: boolean }).ok) {
      const error = (result as { error?: string }).error ?? 'Element interaction failed';
      throw new Error(`${error}: ${ref}. Take a fresh browser_snapshot before retrying.`);
    }

    const success = result as unknown as { result: unknown; x?: unknown; y?: unknown };
    if (typeof success.x === 'number' && typeof success.y === 'number') {
      return { x: success.x, y: success.y };
    }
    return success.result;
  }
}
