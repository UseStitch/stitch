import { buildRefActionScript } from './scripts/ref-action.injected.js';

import type { RefEntry } from './types.js';
import type { WebContents } from 'electron';

export class RefResolver {
  private refs = new Map<string, RefEntry>();

  constructor(private readonly getBrowser: () => Promise<WebContents>) {}

  setRefs(refs: Record<string, RefEntry>): void {
    this.refs = new Map(Object.entries(refs));
  }

  async runOnRef(ref: string, buildScript: (element: string) => string): Promise<unknown> {
    const result = await (
      await this.getBrowser()
    ).executeJavaScript(
      this.refActionScript(ref, (element) => buildScript(element)),
      true,
    );
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
    return this.unwrapRefCoordinates(ref, result);
  }

  async focusRef(ref: string): Promise<void> {
    const result = await (
      await this.getBrowser()
    ).executeJavaScript(
      this.refActionScript(
        ref,
        (element) => `
          ${element}.scrollIntoView({ block: 'center', inline: 'center' });
          ${element}.focus();
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

  private unwrapRefCoordinates(ref: string, result: unknown): { x: number; y: number } {
    const success = this.unwrapRefSuccess(ref, result);
    if (typeof success.x !== 'number' || typeof success.y !== 'number') {
      throw new Error(`Browser interaction on ${ref} did not return coordinates.`);
    }
    return { x: success.x, y: success.y };
  }

  private unwrapRefResult(ref: string, result: unknown): unknown {
    return this.unwrapRefSuccess(ref, result).result;
  }

  private unwrapRefSuccess(
    ref: string,
    result: unknown,
  ): { result: unknown; x?: unknown; y?: unknown } {
    if (!result || typeof result !== 'object' || !('ok' in result)) {
      throw new Error(`Browser interaction on ${ref} did not return a valid result.`);
    }

    if (!(result as { ok: boolean }).ok) {
      const error = (result as { error?: string }).error ?? 'Element interaction failed';
      throw new Error(`${error}: ${ref}. Take a fresh browser_snapshot before retrying.`);
    }

    return result as unknown as { result: unknown; x?: unknown; y?: unknown };
  }
}
