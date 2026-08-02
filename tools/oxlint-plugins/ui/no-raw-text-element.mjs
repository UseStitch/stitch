import {
  getJsxElementName,
  getStaticClassNames,
  getTailwindUtility,
  isDesignSystemPrimitiveFile,
  isUiComponentFile,
} from './jsx-style-utils.mjs';

const RAW_TEXT_ELEMENTS = new Set(['p', 'span']);
const TYPOGRAPHY_UTILITY =
  /^(?:font-|leading-|line-clamp-|text-(?:2xs|xs|sm|base|lg|xl|[2-9]xl|foreground|muted-foreground|text-faint|primary|destructive|success|warning)|tracking-|truncate$)/;

/** @type {import('eslint').Rule.RuleModule} */
const noRawTextElement = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Use Text for styled paragraphs and spans' },
    messages: {
      useText:
        'Migrate styled <{{element}}> to <Text> with a variant, tone, and optional truncate/tabular props; preserve non-typography classes in an appropriate wrapper.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename) || isDesignSystemPrimitiveFile(context.filename)) return {};

    return {
      JSXOpeningElement(node) {
        const element = getJsxElementName(node);
        if (!RAW_TEXT_ELEMENTS.has(element)) return;
        const hasTypography = getStaticClassNames(node).some((className) =>
          TYPOGRAPHY_UTILITY.test(getTailwindUtility(className)),
        );
        if (hasTypography) {
          context.report({ data: { element }, messageId: 'useText', node: node.name });
        }
      },
    };
  },
};

export default noRawTextElement;
