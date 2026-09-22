import { visit } from 'unist-util-visit';

import type { Blockquote, Paragraph, Root } from 'mdast';

/**
 * GitHub alerts: a blockquote whose first line opens with `[!NOTE]`. GitHub requires
 * the marker on its own line, but models routinely inline the body after it, so both
 * shapes are accepted. The marker becomes a title node and the kind becomes a class
 * so styling stays in CSS.
 */

const CALLOUT_LABELS = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
} satisfies Record<string, string>;

const CALLOUT_MARKER = /^\[!([A-Za-z]+)]\s*/;

function calloutTitle(label: string): Paragraph {
  return {
    type: 'paragraph',
    data: { hProperties: { className: ['markdown-callout-title'] } },
    children: [{ type: 'text', value: label }],
  };
}

function transformCallout(node: Blockquote): void {
  const firstBlock = node.children.at(0);
  if (!firstBlock || firstBlock.type !== 'paragraph') return;

  const firstInline = firstBlock.children.at(0);
  if (!firstInline || firstInline.type !== 'text') return;

  const match = CALLOUT_MARKER.exec(firstInline.value);
  if (!match) return;

  const kind = match[1]?.toLowerCase() ?? '';
  const label = Object.entries(CALLOUT_LABELS).find(([calloutKind]) => calloutKind === kind)?.[1];
  if (label === undefined) return;

  firstInline.value = firstInline.value.slice(match[0].length);
  if (firstInline.value === '') {
    firstBlock.children.shift();
  }
  if (firstBlock.children.length === 0) {
    node.children.shift();
  }

  node.children.unshift(calloutTitle(label));
  node.data = { ...node.data, hProperties: { className: ['markdown-callout', `markdown-callout-${kind}`] } };
}

export function remarkGithubCallouts() {
  return (tree: Root) => {
    visit(tree, 'blockquote', transformCallout);
  };
}
