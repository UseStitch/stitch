/**
 * remark-math cannot tell `$...$` inline math from currency, and its single-dollar
 * tokenizer treats `\$` as a delimiter instead of an escape — so `$\$0.02 \text{x}$`
 * shatters. Deciding this after parsing is also impossible: markdown resolves escapes
 * first, turning `RRF\_Score` into `RRF_Score` and destroying the LaTeX.
 *
 * So this pass runs on the raw markdown. Math-like spans become `$$...$$`, which
 * remark-math parses as inline math (with `singleDollarTextMath: false`) and where
 * `\$` survives. Every other dollar is escaped so it renders as literal text.
 */

const LATEX_COMMAND = /\\[a-zA-Z]{2,}|\\[%$&#_{}]|[\^_]\{/;
const SINGLE_VARIABLE = /^[A-Za-z]$/;
const BARE_FORMULA_SHAPED = /^[A-Za-z0-9\s+\-*/=<>^_(){}[\].,;:!'"\\]+$/;
const BARE_FORMULA_OPERATOR = /[=<>^_\\]|\d\s*[+*/]\s*\d/;
const PADDED_CONTENT = /^\s|\s$/;

const MAX_SPAN_LENGTH = 400;
const MAX_BARE_FORMULA_LENGTH = 40;

function isMathLike(content: string): boolean {
  if (content === '' || content.includes('\n') || PADDED_CONTENT.test(content)) return false;
  if (LATEX_COMMAND.test(content)) return true;
  if (SINGLE_VARIABLE.test(content)) return true;
  if (content.length > MAX_BARE_FORMULA_LENGTH) return false;
  return BARE_FORMULA_SHAPED.test(content) && BARE_FORMULA_OPERATOR.test(content);
}

/** Index of the closing `$`, honouring `\$` escapes, or -1. */
function findSpanEnd(markdown: string, openIndex: number): number {
  const limit = Math.min(markdown.length, openIndex + MAX_SPAN_LENGTH + 2);
  for (let i = openIndex + 1; i < limit; i++) {
    const char = markdown[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === '$') return i;
  }
  return -1;
}

/**
 * A run of 3+ backticks is a code fence: skip to its close, or to the end of the
 * document when it is still open (a streaming fence). Shorter unmatched runs are
 * literal text in markdown, so they are left alone.
 */
function findCodeSpanEnd(markdown: string, startIndex: number): number {
  let tickCount = 0;
  while (markdown[startIndex + tickCount] === '`') tickCount++;

  const fence = '`'.repeat(tickCount);
  const closeIndex = markdown.indexOf(fence, startIndex + tickCount);
  if (closeIndex !== -1) return closeIndex + tickCount;
  return tickCount >= 3 ? markdown.length : startIndex + tickCount;
}

export function normalizeInlineMath(markdown: string): string {
  if (!markdown.includes('$')) return markdown;

  let parts: string[] | undefined;
  let unchangedStart = 0;
  let index = 0;
  let tickIndex = markdown.indexOf('`');

  while (index < markdown.length) {
    const dollarIndex = markdown.indexOf('$', index);
    if (dollarIndex === -1) break;

    if (tickIndex !== -1 && tickIndex < index) tickIndex = markdown.indexOf('`', index);

    if (tickIndex !== -1 && tickIndex < dollarIndex) {
      index = findCodeSpanEnd(markdown, tickIndex);
      tickIndex = markdown.indexOf('`', index);
      continue;
    }

    index = dollarIndex;

    if (markdown[index - 1] === '\\') {
      index++;
      continue;
    }

    if (markdown[index + 1] === '$') {
      const closeIndex = markdown.indexOf('$$', index + 2);
      if (closeIndex !== -1) {
        index = closeIndex + 2;
        continue;
      }
    }

    const spanEnd = findSpanEnd(markdown, index);
    const content = spanEnd === -1 ? '' : markdown.slice(index + 1, spanEnd);
    parts ??= [];
    parts.push(markdown.slice(unchangedStart, index));

    if (isMathLike(content)) {
      parts.push('$$', content, '$$');
      index = spanEnd + 1;
      unchangedStart = index;
      continue;
    }

    parts.push('\\$');
    index++;
    unchangedStart = index;
  }

  if (!parts) return markdown;
  parts.push(markdown.slice(unchangedStart));
  return parts.join('');
}
