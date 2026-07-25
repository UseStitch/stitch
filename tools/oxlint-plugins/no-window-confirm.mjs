function isWindowConfirmCallee(callee) {
  if (callee.type === 'Identifier') {
    return callee.name === 'confirm';
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'window' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'confirm'
  );
}

/** @type {import('eslint').Rule.RuleModule} */
const noWindowConfirm = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require the AlertDialog component instead of window.confirm' },
    messages: { useAlertDialog: 'Use AlertDialog from @/components/ui/alert-dialog instead of window.confirm.' },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isWindowConfirmCallee(node.callee)) {
          context.report({ messageId: 'useAlertDialog', node });
        }
      },
    };
  },
};

export default noWindowConfirm;
