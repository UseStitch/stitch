import { getStaticClassNames, getTailwindUtility, isUiComponentFile } from './jsx-style-utils.mjs';

const ARBITRARY_DESIGN_UTILITY = /^(?:accent|bg|border(?:-[xytrblse])?|caret|decoration|divide-[xy]|fill|from|gap(?:-[xy])?|leading|m[xytrblse]?|outline|p[xytrblse]?|ring|rounded(?:-[trblse]|-[trblse]{2})?|shadow|space-[xy]|stroke|text|to|tracking|via)-\[/;

/** @type {import('eslint').Rule.RuleModule} */
const noArbitraryDesignValues = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require design tokens for arbitrary color, spacing, radius, and typography values' },
    messages: {
      useDesignToken: 'Replace arbitrary design class "{{className}}" with a named token or shared component variant.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};

    return {
      JSXOpeningElement(node) {
        for (const className of getStaticClassNames(node)) {
          if (ARBITRARY_DESIGN_UTILITY.test(getTailwindUtility(className))) {
            context.report({ data: { className }, messageId: 'useDesignToken', node });
          }
        }
      },
    };
  },
};

export default noArbitraryDesignValues;
