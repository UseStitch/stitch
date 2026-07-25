/** @type {import('eslint').Rule.RuleModule} */
const noNativeButton = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require the shared Button component instead of native button elements' },
    messages: { useButton: 'Use Button from @/components/ui/button instead of a native <button>.' },
    schema: [],
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (node.name.type === 'JSXIdentifier' && node.name.name === 'button') {
          context.report({ messageId: 'useButton', node: node.name });
        }
      },
    };
  },
};

export default noNativeButton;
