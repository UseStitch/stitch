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
const CONTAINS_MATH_SPAN = /(?:\$\$[^\n]+\$\$|\$[^$\n]+\$)/;

interface MarkDetails {
  node: Delete;
  delimiter: string;
  value: string;
  tagName: string;
}

function toMarkDetails(groups: Record<string, string | undefined>): MarkDetails | undefined {
  for (const [tagName, value] of Object.entries(groups)) {
    if (value === undefined) continue;
    return {
      node: { type: 'delete', data: { hName: tagName }, children: [{ type: 'text', value }] },
      delimiter: tagName === 'mark' ? '==' : tagName === 'sub' ? '~' : '^',
      value,
      tagName,
    };
  }
  return undefined;
}

function precedingBackslashes(raw: string, index: number): number {
  let count = 0;
  while (raw[index - count - 1] === '\\') count++;
  return count;
}

function findRawMark(raw: string, delimiter: string, fromIndex: number) {
  const opening = raw.indexOf(delimiter, fromIndex);
  if (opening === -1) return undefined;

  const closing = raw.indexOf(delimiter, opening + delimiter.length);
  if (closing === -1) return undefined;

  return {
    end: closing + delimiter.length,
    escaped: precedingBackslashes(raw, opening) % 2 === 1 || precedingBackslashes(raw, closing) % 2 === 1,
  };
}

function splitMarks(node: Text, raw: string): PhrasingContent[] | undefined {
  const nodes: PhrasingContent[] = [];
  let lastIndex = 0;
  let rawIndex = 0;

  for (const match of node.value.matchAll(MARK_PATTERN)) {
    const details = toMarkDetails(match.groups ?? {});
    if (details === undefined) continue;

    const rawMark = findRawMark(raw, details.delimiter, rawIndex);
    if (rawMark === undefined) continue;
    rawIndex = rawMark.end;
    if (rawMark.escaped || (details.tagName === 'mark' && CONTAINS_MATH_SPAN.test(details.value))) continue;

    if (match.index > lastIndex) {
      nodes.push({ type: 'text', value: node.value.slice(lastIndex, match.index) });
    }
    nodes.push(details.node);
    lastIndex = match.index + match[0].length;
  }

  if (nodes.length === 0) return undefined;

  if (lastIndex < node.value.length) {
    nodes.push({ type: 'text', value: node.value.slice(lastIndex) });
  }

  return nodes;
}

export function remarkTextMarks() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);

    visit(tree, 'text', (node, index, parent) => {
      if (parent === undefined || index === undefined) return undefined;

      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      const raw = start === undefined || end === undefined ? node.value : source.slice(start, end);
      const replacement = splitMarks(node, raw);
      if (replacement === undefined) return undefined;

      // Every parent of a `text` node holds phrasing content.
      (parent.children as PhrasingContent[]).splice(index, 1, ...replacement);
      return [SKIP, index + replacement.length];
    });
  };
}
