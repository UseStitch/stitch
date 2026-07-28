import { isUiComponentFile } from './jsx-style-utils.mjs';

const UI_PRIMITIVE_PACKAGES = ['@base-ui/react', '@radix-ui/'];

/** @type {import('eslint').Rule.RuleModule} */
const noDirectUiPrimitives = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Keep third-party UI primitives behind shared UI components' },
    messages: {
      useSharedUi: 'Import from @/components/ui instead of using {{source}} directly.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string' || !UI_PRIMITIVE_PACKAGES.some((prefix) => source.startsWith(prefix))) return;

        context.report({ data: { source }, messageId: 'useSharedUi', node: node.source });
      },
    };
  },
};

export default noDirectUiPrimitives;
