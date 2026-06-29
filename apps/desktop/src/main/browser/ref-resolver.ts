import { buildRefActionScript } from './scripts/ref-action.injected.js';

import type { RefEntry } from './types.js';
import type { WebContents } from 'electron';

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
    return this.unwrapRefCoordinates(ref, result);
  }

  async resolveRefBounds(
    ref: string,
  ): Promise<{ x: number; y: number; width: number; height: number }> {
    const result = await (
      await this.getBrowser()
    ).executeJavaScript(
      this.refActionScript(
        ref,
        (element) =>
          `${element}.scrollIntoView({ block: 'center', inline: 'center' }); return true;`,
      ),
      true,
    );
    const coordinates = this.unwrapRefCoordinates(ref, result);
    const { width, height } = coordinates;
    if (typeof width !== 'number' || typeof height !== 'number') {
      throw new Error(`Browser interaction on ${ref} did not return bounds.`);
    }
    return { x: coordinates.x, y: coordinates.y, width, height };
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

  private unwrapRefCoordinates(
    ref: string,
    result: unknown,
  ): { x: number; y: number; width?: number; height?: number } {
    const success = this.unwrapRefSuccess(ref, result);
    if (typeof success.x !== 'number' || typeof success.y !== 'number') {
      throw new Error(`Browser interaction on ${ref} did not return coordinates.`);
    }
    return {
      x: success.x,
      y: success.y,
      width: typeof success.width === 'number' ? success.width : undefined,
      height: typeof success.height === 'number' ? success.height : undefined,
    };
  }

  private unwrapRefResult(ref: string, result: unknown): unknown {
    return this.unwrapRefSuccess(ref, result).result;
  }

  private unwrapRefSuccess(
    ref: string,
    result: unknown,
  ): { result: unknown; x?: unknown; y?: unknown; width?: unknown; height?: unknown } {
    if (!result || typeof result !== 'object' || !('ok' in result)) {
      throw new Error(`Browser interaction on ${ref} did not return a valid result.`);
    }

    if (!(result as { ok: boolean }).ok) {
      const error = (result as { error?: string }).error ?? 'Element interaction failed';
      throw new Error(`${error}: ${ref}. Take a fresh browser_snapshot before retrying.`);
    }

    return result as unknown as {
      result: unknown;
      x?: unknown;
      y?: unknown;
      width?: unknown;
      height?: unknown;
    };
  }
}
