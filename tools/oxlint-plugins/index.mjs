import noCollapsibleIf from './no-collapsible-if.mjs';
import noNativeButton from './no-native-button.mjs';

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  meta: { name: 'stitch' },
  rules: { 'no-collapsible-if': noCollapsibleIf, 'no-native-button': noNativeButton },
};

export default plugin;
