import { visit } from 'unist-util-visit';

import type { Element, Root } from 'hast';

const URL_PROPERTIES = ['cite', 'href', 'longDesc', 'src'] as const;
const URL_SCHEME = /^([a-z][a-z\d+.-]*):/i;

/** The sanitizer compares protocols case-sensitively, while URL schemes are case-insensitive. */
export function rehypeNormalizeUrlProtocols() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      for (const property of URL_PROPERTIES) {
        const value = node.properties[property];
        if (typeof value !== 'string') continue;

        node.properties[property] = value.replace(URL_SCHEME, (scheme) => scheme.toLowerCase());
      }
    });
  };
}
