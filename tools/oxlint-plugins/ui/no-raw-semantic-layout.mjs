import {
  getJsxElementName,
  getStaticClassNames,
  getTailwindUtility,
  isDesignSystemPrimitiveFile,
  isUiComponentFile,
} from './jsx-style-utils.mjs';

const RAW_LAYOUT_ELEMENTS = new Set(['aside', 'footer', 'form', 'header', 'li', 'main', 'nav', 'ol', 'section', 'ul']);
const STACK_UTILITY =
  /^(?:flex|flex-(?:1|row|col|wrap|nowrap)|gap-(?:space-)?(?:none|2xs|xs|s|m|l|xl|2xl|3xl)|h-full|items-(?:start|center|end|stretch)|justify-(?:start|center|end|between)|min-w-0|overflow-(?:auto|hidden|y-auto)|p-(?:space-)?(?:none|2xs|xs|s|m|l|xl|2xl|3xl)|w-full)$/;

/** @type {import('eslint').Rule.RuleModule} */
const noRawSemanticLayout = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Use polymorphic Stack for class-styled semantic layout containers' },
    messages: {
      useStack: 'Migrate this layout <{{element}}> to <Stack as="{{element}}"> using its supported layout props.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename) || isDesignSystemPrimitiveFile(context.filename)) return {};

    return {
      JSXOpeningElement(node) {
        const element = getJsxElementName(node);
        if (!element || !RAW_LAYOUT_ELEMENTS.has(element)) return;
        const classNames = getStaticClassNames(node);
        const hasFlex = classNames.includes('flex');
        const hasSupportedLayout = classNames.some(
          (className) => !className.includes(':') && STACK_UTILITY.test(getTailwindUtility(className)),
        );
        if (hasFlex && hasSupportedLayout) {
          context.report({ data: { element }, messageId: 'useStack', node: node.name });
        }
      },
    };
  },
};

export default noRawSemanticLayout;
