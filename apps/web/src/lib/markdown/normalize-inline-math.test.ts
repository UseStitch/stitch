import { describe, expect, test } from 'bun:test';

import { normalizeInlineMath } from './normalize-inline-math.js';

describe('normalizeInlineMath', () => {
  test('returns text without dollars untouched', () => {
    expect(normalizeInlineMath('Plain **markdown** with `code`.')).toBe('Plain **markdown** with `code`.');
  });

  test('promotes spans containing LaTeX commands to double-dollar math', () => {
    expect(normalizeInlineMath('$100,000 \\text{ LOC} \\approx 600,000 \\text{ tokens}$.')).toBe(
      '$$100,000 \\text{ LOC} \\approx 600,000 \\text{ tokens}$$.',
    );
  });

  test('keeps escaped dollars inside promoted math spans', () => {
    expect(normalizeInlineMath('Cost: $\\$0.02 \\text{ per 1M tokens}$.')).toBe(
      'Cost: $$\\$0.02 \\text{ per 1M tokens}$$.',
    );
  });

  test('promotes spans whose only LaTeX signal is an escaped punctuation command', () => {
    expect(normalizeInlineMath('Only $<2\\%$ of files change.')).toBe('Only $$<2\\%$$ of files change.');
  });

  test('promotes short bare formulas containing an operator', () => {
    expect(normalizeInlineMath('where $k=60$ and $>1.5$ seconds')).toBe('where $$k=60$$ and $$>1.5$$ seconds');
  });

  test('escapes currency pairs that would otherwise look like a span', () => {
    expect(normalizeInlineMath('Cursor charges $20/mo (Pro) or $40/mo.')).toBe(
      'Cursor charges \\$20/mo (Pro) or \\$40/mo.',
    );
  });

  test('escapes a lone dollar with no closing delimiter', () => {
    expect(normalizeInlineMath('Total of $3.23 per user')).toBe('Total of \\$3.23 per user');
  });

  test('escapes spans padded with whitespace', () => {
    expect(normalizeInlineMath('from $10 to $20 total')).toBe('from \\$10 to \\$20 total');
  });

  test('rejects spans that cross a line boundary', () => {
    expect(normalizeInlineMath('| **$0 / month** |\n| **$29 / month** |')).toBe(
      '| **\\$0 / month** |\n| **\\$29 / month** |',
    );
  });

  test('rejects bare formulas longer than the short-span limit', () => {
    const long = 'a=1 and the rest of this sentence is far too long to be a formula';
    expect(normalizeInlineMath(`$${long}$`)).toBe(`\\$${long}\\$`);
  });

  test('leaves already-escaped dollars alone', () => {
    expect(normalizeInlineMath('Costs \\$20 per seat.')).toBe('Costs \\$20 per seat.');
  });

  test('passes existing double-dollar math through unchanged', () => {
    expect(normalizeInlineMath('Inline $$x + y$$ and block\n\n$$\na = b\n$$\n')).toBe(
      'Inline $$x + y$$ and block\n\n$$\na = b\n$$\n',
    );
  });

  test('escapes an unpaired double dollar', () => {
    expect(normalizeInlineMath('Price is $$20')).toBe('Price is \\$\\$20');
  });

  test('ignores dollars inside inline code', () => {
    expect(normalizeInlineMath('Run `echo $HOME` then $x=1$.')).toBe('Run `echo $HOME` then $$x=1$$.');
  });

  test('ignores dollars inside fenced code blocks', () => {
    const input = '```sh\nexport A=$1\necho $PATH\n```\n\nCost $20.';
    expect(normalizeInlineMath(input)).toBe('```sh\nexport A=$1\necho $PATH\n```\n\nCost \\$20.');
  });

  test('ignores dollars after an unterminated fence', () => {
    expect(normalizeInlineMath('```sh\nexport A=$1 $2')).toBe('```sh\nexport A=$1 $2');
  });

  test('does not swallow the document on an unmatched single backtick', () => {
    expect(normalizeInlineMath('a ` b $20 c')).toBe('a ` b \\$20 c');
  });
});
