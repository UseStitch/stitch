import { getStaticClassNames, isUiComponentFile } from './jsx-style-utils.mjs';

const ALLOWED_DARK_CLASSES = new Set(['dark:prose-invert']);

/** @type {import('eslint').Rule.RuleModule} */
const noDarkVariant = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep named themes correct by relying on semantic theme classes instead of dark variants' },
    messages: {
      useThemeClass:
        'Remove "{{className}}"; named themes already switch semantic classes between light and dark appearances.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};

    return {
      JSXOpeningElement(node) {
        for (const className of getStaticClassNames(node)) {
          if (className.includes('dark:') && !ALLOWED_DARK_CLASSES.has(className)) {
            context.report({ data: { className }, messageId: 'useThemeClass', node });
          }
        }
      },
    };
  },
};

export default noDarkVariant;
