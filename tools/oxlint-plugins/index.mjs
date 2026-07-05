import noCollapsibleIf from './no-collapsible-if.mjs';

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  meta: {
    name: 'stitch',
  },
  rules: {
    'no-collapsible-if': noCollapsibleIf,
  },
};

export default plugin;
