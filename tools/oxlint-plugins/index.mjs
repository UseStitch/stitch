import noCallOnlyAssertions from './no-call-only-assertions.mjs';
import noWindowConfirm from './no-window-confirm.mjs';
import uiRules from './ui/index.mjs';

/** @type {{ meta: { name: string }, rules: Record<string, unknown> }} */
const plugin = {
  meta: { name: 'stitch' },
  rules: { 'no-call-only-assertions': noCallOnlyAssertions, 'no-window-confirm': noWindowConfirm, ...uiRules },
};

export default plugin;
