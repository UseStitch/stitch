import { getStaticClassNames, getTailwindUtility, isUiComponentFile } from './jsx-style-utils.mjs';

const COLOR_NAMES =
  '(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';
const COLOR_UTILITY = new RegExp(
  `^(?:accent|bg|border(?:-[xytrblse])?|caret|decoration|divide-[xy]|fill|from|outline|ring|shadow|stroke|text|to|via)-${COLOR_NAMES}(?:-|/|$)`,
);

/** @type {import('eslint').Rule.RuleModule} */
const noRawTailwindColors = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require semantic theme colors instead of Tailwind palette colors' },
    messages: { useSemanticColor: 'Replace raw color class "{{className}}" with an existing semantic theme class.' },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};

    return {
      JSXOpeningElement(node) {
        for (const className of getStaticClassNames(node)) {
          if (COLOR_UTILITY.test(getTailwindUtility(className))) {
            context.report({ data: { className }, messageId: 'useSemanticColor', node });
          }
        }
      },
    };
  },
};

export default noRawTailwindColors;
