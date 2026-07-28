import { ICON_SIZE_REPLACEMENTS } from './design-system.generated.mjs';
import { getJsxElementName, getStaticClassNames, getTailwindUtility, isUiComponentFile } from './jsx-style-utils.mjs';

const ICON_DIMENSION = /^(?:h|w)-(\d+(?:\.\d+)?)$/;

/** @type {import('eslint').Rule.RuleModule} */
const noIconDimensionClasses = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Use Icon instead of paired height and width classes on icon components' },
    messages: {
      useIconSize: 'Wrap <{{element}}> with <Icon as={{{element}}} size="{{size}}">.',
      useIconComponent: 'Replace the hand-sized <{{element}}> illustration with an existing shared component.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};
    const icons = new Set();
    return {
      ImportDeclaration(node) {
        if (
          node.source.value !== 'lucide-react' &&
          !node.source.value.startsWith('@/components/icons/') &&
          node.source.value !== '@/components/ui/simple-icon'
        )
          return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') icons.add(specifier.local.name);
        }
      },
      JSXOpeningElement(node) {
        const element = getJsxElementName(node);
        if (!icons.has(element)) return;
        const classNames = getStaticClassNames(node);
        for (const className of classNames) {
          const utility = getTailwindUtility(className);
          const match = ICON_DIMENSION.exec(utility);
          if (!match) continue;
          const counterpart = utility.startsWith('h-') ? `w-${match[1]}` : `h-${match[1]}`;
          if (!classNames.some((candidate) => getTailwindUtility(candidate) === counterpart)) continue;
          const size = ICON_SIZE_REPLACEMENTS.get(`size-${match[1]}`);
          context.report({ data: size ? { element, size } : { element }, messageId: size ? 'useIconSize' : 'useIconComponent', node: node.name });
          return;
        }
      },
    };
  },
};

export default noIconDimensionClasses;
