import { getJsxElementName, getStaticClassNames, getTailwindUtility, isUiComponentFile } from './jsx-style-utils.mjs';

const CONTROL_COMPONENTS = new Set(['Button', 'Input', 'SearchInput', 'SelectTrigger', 'Textarea']);
const STRUCTURAL_UTILITY = /^(?:border(?:-[xytrblse])?|gap(?:-[xy])?|h|max-h|min-h|p[xytrblse]?|ring|rounded(?:-[trblse]|-[trblse]{2})?)(?:-|$)/;

/** @type {import('eslint').Rule.RuleModule} */
const noComponentStyleOverrides = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require shared control variants instead of structural class overrides' },
    messages: {
      useVariant: 'Define a {{component}} variant instead of overriding it with "{{className}}".',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};

    return {
      JSXOpeningElement(node) {
        const component = getJsxElementName(node);
        if (!component || !CONTROL_COMPONENTS.has(component)) return;

        for (const className of getStaticClassNames(node)) {
          if (STRUCTURAL_UTILITY.test(getTailwindUtility(className))) {
            context.report({ data: { className, component }, messageId: 'useVariant', node });
          }
        }
      },
    };
  },
};

export default noComponentStyleOverrides;
