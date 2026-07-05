import { DOM_HELPERS_SCRIPT } from './dom-helpers.injected.js';

import type { RefEntry } from '../types.js';

export function buildRefActionScript(entry: RefEntry, buildScript: (element: string) => string): string {
  return `(() => {
    const target = ${JSON.stringify(entry)};

    ${DOM_HELPERS_SCRIPT}

    function matchesIdentity(el) {
      return el.tagName.toLowerCase() === target.tag && role(el) === target.role && name(el) === target.name && visible(el);
    }

    function distanceFromSnapshot(el) {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      return Math.hypot(x - target.x, y - target.y);
    }

    function resolveElement() {
      try {
        const current = document.querySelector(target.selector);
        if (current && matchesIdentity(current)) return current;
      } catch {}

      const candidates = allElements(document).filter((element) => element.tagName.toLowerCase() === target.tag && matchesIdentity(element));
      candidates.sort((a, b) => distanceFromSnapshot(a) - distanceFromSnapshot(b));
      return candidates[0] || null;
    }

    function allElements(root) {
      const elements = Array.from(root.querySelectorAll('*'));
      for (const element of [...elements]) {
        if (element.shadowRoot) elements.push(...allElements(element.shadowRoot));
      }
      return elements;
    }

    const el = resolveElement();
    if (!el) return { ok: false, error: 'Element not found' };
    const actionResult = (() => { ${buildScript('el')} })();
    const rect = el.getBoundingClientRect();
    return {
      ok: true,
      result: actionResult,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  })()`;
}
