import {
  getJsxElementName,
  getStaticClassNames,
  getTailwindUtility,
  isDesignSystemPrimitiveFile,
  isUiComponentFile,
} from './jsx-style-utils.mjs';

const STACK_UTILITY =
  /^(?:flex|flex-(?:row|col|wrap|nowrap)|gap-(?:space-)?(?:none|2xs|xs|s|m|l|xl|2xl|3xl)|items-(?:start|center|end|stretch)|justify-(?:start|center|end|between)|p-(?:space-)?(?:none|2xs|xs|s|m|l|xl|2xl|3xl))$/;

/** @type {import('eslint').Rule.RuleModule} */
const noRawLayoutDiv = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Use Stack for class-styled layout divs' },
    messages: {
      useStack:
        'Migrate this layout <div> to <Stack> using direction, gap, align, justify, padding, and wrap props; keep Stack-free divs for non-layout semantics.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename) || isDesignSystemPrimitiveFile(context.filename)) return {};

    return {
      JSXOpeningElement(node) {
        if (getJsxElementName(node) !== 'div') return;
        const classNames = getStaticClassNames(node);
        const hasFlex = classNames.includes('flex');
        const isStackCompatible = classNames.every(
          (className) => !className.includes(':') && STACK_UTILITY.test(getTailwindUtility(className)),
        );
        if (hasFlex && isStackCompatible) context.report({ messageId: 'useStack', node: node.name });
      },
    };
  },
};

export default noRawLayoutDiv;
