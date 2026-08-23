import { visit } from 'unist-util-visit';

import type { Element, Root } from 'hast';

const P = ['cite', 'href', 'longDesc', 'src'];
const S = /^([a-z][a-z\d+.-]*):/i;

export function rehypeNormalizeUrlProtocols() {
  return (tree: Root) =>
    visit(tree, 'element', (n: Element) => {
      for (const p of P) {
        const v = n.properties[p];
        if (typeof v === 'string') n.properties[p] = v.replace(S, (m) => m.toLowerCase());
      }
    });
}
