import { describe, expect, test } from 'bun:test';

import { hasMeaningfulMailText, hasReplyAttributionText } from './message-body.js';

describe('message body quoted reply helpers', () => {
  test('treats whitespace and zero-width characters as empty', () => {
    expect(hasMeaningfulMailText(' \n\t\u200b\ufeff ')).toBe(false);
    expect(hasMeaningfulMailText(' quoted text ')).toBe(true);
  });

  test('detects common trailing reply attribution lines', () => {
    expect(hasReplyAttributionText('Thanks\n\nOn Sun, Jun 28, 2026 at 5:50 PM Bob <bob@example.com> wrote:')).toBe(
      true,
    );
    expect(hasReplyAttributionText('-----Original Message-----')).toBe(true);
  });

  test('does not treat ordinary prose as reply attribution', () => {
    expect(hasReplyAttributionText('I wrote: this is an example quote')).toBe(false);
    expect(hasReplyAttributionText('A blockquote follows')).toBe(false);
  });
});
