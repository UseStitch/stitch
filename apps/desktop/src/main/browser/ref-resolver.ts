import { buildRefActionScript } from './scripts/ref-action.injected.js';

import type { RefActionSuccess } from './scripts/ref-action.injected.js';
import type { RefEntry } from './types.js';
import type { WebContents } from 'electron';

/** The injected script's return value before validation, since it crosses `executeJavaScript`. */
type UnvalidatedRefAction = {
  ok?: boolean;
  error?: string;
  result?: unknown;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export class RefResolver {
  private refs = new Map<string, RefEntry>();

  constructor(private readonly getBrowser: () => Promise<WebContents>) {}

  setRefs(refs: Record<string, RefEntry>): void {
    this.refs = new Map(Object.entries(refs));
  }

  findRefBySelector(selector: string): string | undefined {
    for (const [ref, entry] of this.refs) {
      if (entry.selector === selector) return ref;
    }
    return undefined;
  }

  async runOnRef<T = unknown>(ref: string, buildScript: (element: string) => string): Promise<T> {
    const result = await (
      await this.getBrowser()
    ).executeJavaScript(
      this.refActionScript(ref, (element) => buildScript(element)),
      true,
    );
    return this.unwrapRefResult(ref, result) as T;
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
    const { x, y } = this.unwrapRefSuccess(ref, result);
    return { x, y };
  }

  async resolveRefBounds(ref: string): Promise<{ x: number; y: number; width: number; height: number }> {
    const result = await (
      await this.getBrowser()
    ).executeJavaScript(
      this.refActionScript(
        ref,
        (element) => `${element}.scrollIntoView({ block: 'center', inline: 'center' }); return true;`,
      ),
      true,
    );
    const { x, y, width, height } = this.unwrapRefSuccess(ref, result);
    return { x, y, width, height };
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

  private unwrapRefResult(ref: string, result: unknown): unknown {
    return this.unwrapRefSuccess(ref, result).result;
  }

  private unwrapRefSuccess(ref: string, result: unknown): RefActionSuccess {
    if (!result || typeof result !== 'object' || !('ok' in result)) {
      throw new Error(`Browser interaction on ${ref} did not return a valid result.`);
    }

    const { ok, error, result: actionResult, x, y, width, height } = result as UnvalidatedRefAction;

    if (!ok) {
      throw new Error(
        `${error ?? 'Element interaction failed'}: ${ref}. Take a fresh browser_snapshot before retrying.`,
      );
    }

    if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
      throw new Error(`Browser interaction on ${ref} did not return coordinates.`);
    }

    return { ok: true, result: actionResult, x, y, width, height };
  }
}
