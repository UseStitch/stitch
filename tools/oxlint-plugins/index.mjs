import noCallOnlyAssertions from './no-call-only-assertions.mjs';
import noCollapsibleIf from './no-collapsible-if.mjs';
import noNativeButton from './no-native-button.mjs';
import noWindowConfirm from './no-window-confirm.mjs';

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  meta: { name: 'stitch' },
  rules: {
    'no-call-only-assertions': noCallOnlyAssertions,
    'no-collapsible-if': noCollapsibleIf,
    'no-native-button': noNativeButton,
    'no-window-confirm': noWindowConfirm,
  },
};

export default plugin;
