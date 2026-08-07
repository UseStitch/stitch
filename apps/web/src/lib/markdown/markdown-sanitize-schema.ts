import { defaultSchema } from 'rehype-sanitize';

import type { Options as SanitizeSchema } from 'rehype-sanitize';

/**
 * Raw HTML from a model is untrusted, so it is sanitized with GitHub's schema plus the
 * few inline tags GitHub allows but hast-util-sanitize omits. Sanitizing runs before
 * rehype-katex, which means the classes remark-math emits must survive the pass.
 */

const defaultAttributes = defaultSchema.attributes ?? {};

export const markdownSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  strip: ['script', 'style'],
  tagNames: [...(defaultSchema.tagNames ?? []), 'abbr', 'mark', 'small', 'u'],
  attributes: {
    ...defaultAttributes,
    blockquote: [...defaultAttributes.blockquote, ['className', /^markdown-callout(?:-|$)/]],
    // `math-inline`/`math-display` are how rehype-katex finds math to render.
    code: [['className', /^language-./, 'math-inline', 'math-display']],
    p: [
      ...((defaultAttributes.p as typeof defaultAttributes.blockquote | undefined) ?? []),
      ['className', 'markdown-callout-title'],
    ],
  },
};
