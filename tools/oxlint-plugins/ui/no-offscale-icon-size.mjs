import { ICON_SIZE_REPLACEMENTS } from './design-system.generated.mjs';
import { getJsxElementName, getStaticClassNames, getTailwindUtility, isUiComponentFile } from './jsx-style-utils.mjs';

const ICON_SIZE = /^size-(\d+(?:\.\d+)?)$/;

/** @type {import('eslint').Rule.RuleModule} */
const noOffscaleIconSize = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Use Icon and its closed size scale instead of sizing icon components with classes' },
    messages: {
      useIconSize:
        'Wrap <{{element}}> with <Icon as={{{element}}} size="{{size}}"> and move non-size icon classes to supported props.',
      useIconComponent:
        'Replace the hand-sized <{{element}}> illustration with Icon or the shared empty-state/badge component matching its intent.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};
    const icons = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== 'lucide-react') return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') icons.add(specifier.local.name);
        }
      },
      JSXOpeningElement(node) {
        const element = getJsxElementName(node);
        if (!icons.has(element)) return;

        for (const className of getStaticClassNames(node)) {
          const utility = getTailwindUtility(className);
          if (!ICON_SIZE.test(utility)) continue;
          const size = ICON_SIZE_REPLACEMENTS.get(utility);
          context.report({
            data: size ? { element, size } : { element },
            messageId: size ? 'useIconSize' : 'useIconComponent',
            node: node.name,
          });
        }
      },
    };
  },
};

export default noOffscaleIconSize;
