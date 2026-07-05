// Collapsible "if" statements should be merged.
// Ported from the SonarJS S1066 rule: https://sonarsource.github.io/rspec/#/rspec/S1066

const MESSAGE = 'Merge this if statement with the nested one.';

function isIfStatement(node) {
  return node?.type === 'IfStatement';
}

function isBlockStatement(node) {
  return node?.type === 'BlockStatement';
}

function isIfStatementWithoutElse(node) {
  return isIfStatement(node) && !node.alternate;
}

/** @type {import('eslint').Rule.RuleModule} */
const noCollapsibleIf = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Collapsible "if" statements should be merged' },
    messages: { mergeNestedIfStatement: MESSAGE },
    schema: [],
  },
  create(context) {
    return {
      IfStatement(node) {
        let consequent = node.consequent;
        if (isBlockStatement(consequent) && consequent.body.length === 1) {
          consequent = consequent.body[0];
        }
        if (isIfStatementWithoutElse(node) && isIfStatementWithoutElse(consequent)) {
          const enclosingIfKeyword = context.sourceCode.getFirstToken(node);
          if (enclosingIfKeyword) {
            context.report({ messageId: 'mergeNestedIfStatement', loc: enclosingIfKeyword.loc });
          }
        }
      },
    };
  },
};

export default noCollapsibleIf;
