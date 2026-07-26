import { SKIP, visit } from 'unist-util-visit';

import type { Delete, PhrasingContent, Root, Text } from 'mdast';

/**
 * `==highlight==`, `~sub~`, and `^sup^` are not part of GFM, so they arrive as plain
 * text. Each capture group is named after the tag it produces. Delimited content may
 * not contain whitespace (except for `==`) and subscript/superscript spans are kept
 * short, so prose like `~/.config and ~/.local` or `2 ^ 3` is left alone.
 *
 * Requires remark-gfm's `singleTilde: false`, otherwise `~sub~` is parsed as
 * strikethrough before this runs.
 */

const MARK_PATTERN = /==(?<mark>[^\s=][^=\n]*?)==|~(?<sub>[^\s~]{1,24})~|\^(?<sup>[^\s^]{1,24})\^/g;

function toMarkNode(groups: Record<string, string | undefined>): Delete | undefined {
  for (const [tagName, value] of Object.entries(groups)) {
    if (value === undefined) continue;
    return { type: 'delete', data: { hName: tagName }, children: [{ type: 'text', value }] };
  }
  return undefined;
}

function splitMarks(node: Text): PhrasingContent[] | undefined {
  const nodes: PhrasingContent[] = [];
  let lastIndex = 0;

  for (const match of node.value.matchAll(MARK_PATTERN)) {
    const markNode = toMarkNode(match.groups ?? {});
    if (markNode === undefined) continue;

    if (match.index > lastIndex) {
      nodes.push({ type: 'text', value: node.value.slice(lastIndex, match.index) });
    }
    nodes.push(markNode);
    lastIndex = match.index + match[0].length;
  }

  if (nodes.length === 0) return undefined;

  if (lastIndex < node.value.length) {
    nodes.push({ type: 'text', value: node.value.slice(lastIndex) });
  }

  return nodes;
}

export function remarkTextMarks() {
  return (tree: Root) => {
    visit(tree, 'text', (node, index, parent) => {
      if (parent === undefined || index === undefined) return undefined;

      const replacement = splitMarks(node);
      if (replacement === undefined) return undefined;

      // Every parent of a `text` node holds phrasing content.
      (parent.children as PhrasingContent[]).splice(index, 1, ...replacement);
      return [SKIP, index + replacement.length];
    });
  };
}
