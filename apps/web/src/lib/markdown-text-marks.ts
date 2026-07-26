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

function findRawMark(raw: string, delimiter: string, value: string, fromIndex: number) {
  const candidates = [
    { value: `${delimiter}${value}${delimiter}`, escaped: false },
    { value: `\\${delimiter}${value}${delimiter}`, escaped: true },
    { value: `${delimiter}${value}\\${delimiter}`, escaped: true },
    { value: `\\${delimiter}${value}\\${delimiter}`, escaped: true },
  ];
  let found: { index: number; length: number; escaped: boolean } | undefined;

  for (const candidate of candidates) {
    const index = raw.indexOf(candidate.value, fromIndex);
    if (index === -1 || (found !== undefined && index >= found.index)) continue;
    found = { index, length: candidate.value.length, escaped: candidate.escaped };
  }

  return found;
}

function splitMarks(node: Text, raw: string): PhrasingContent[] | undefined {
  const nodes: PhrasingContent[] = [];
  let lastIndex = 0;
  let rawIndex = 0;

  for (const match of node.value.matchAll(MARK_PATTERN)) {
    const details = toMarkDetails(match.groups ?? {});
    if (details === undefined) continue;

    const rawMark = findRawMark(raw, details.delimiter, details.value, rawIndex);
    if (rawMark === undefined) continue;
    rawIndex = rawMark.index + rawMark.length;
    if (rawMark.escaped || (details.tagName === 'mark' && details.value.includes('$'))) continue;

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
