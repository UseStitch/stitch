// Tests whose every assertion is a "was it called" mock check verify orchestration, not behavior.
// `toHaveBeenCalledWith` is allowed because it asserts on real data.

const CALL_ONLY_MATCHERS = new Set(['toHaveBeenCalled', 'toHaveBeenCalledTimes', 'toHaveBeenCalledOnce']);
const TEST_NAMES = new Set(['it', 'test']);
const MODIFIERS = new Set(['not', 'resolves', 'rejects']);

function rootIdentifierName(node) {
  let current = node;
  while (current) {
    if (current.type === 'Identifier') return current.name;
    if (current.type === 'MemberExpression') {
      current = current.object;
    } else if (current.type === 'CallExpression' || current.type === 'TaggedTemplateExpression') {
      current = current.callee ?? current.tag;
    } else {
      return undefined;
    }
  }
  return undefined;
}

function isTestCall(node) {
  if (!TEST_NAMES.has(rootIdentifierName(node.callee))) return false;
  const callback = node.arguments.at(-1);
  return callback?.type === 'FunctionExpression' || callback?.type === 'ArrowFunctionExpression';
}

function matcherName(node) {
  if (node.callee.type !== 'MemberExpression' || node.callee.computed) return undefined;
  if (node.callee.property.type !== 'Identifier') return undefined;
  let object = node.callee.object;
  while (object.type === 'MemberExpression' && !object.computed && MODIFIERS.has(object.property.name)) {
    object = object.object;
  }
  const isExpectCall = object.type === 'CallExpression' && rootIdentifierName(object.callee) === 'expect';
  return isExpectCall ? node.callee.property.name : undefined;
}

/** @type {import('eslint').Rule.RuleModule} */
const noCallOnlyAssertions = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Tests must assert on behavior, not only that a mock was called' },
    messages: {
      callOnlyAssertions:
        'Every assertion in this test only checks that a mock was called. First check whether this is a valuable test; remove it if not. Otherwise, assert on returned values, state, or call arguments instead.',
    },
    schema: [],
  },
  create(context) {
    /** @type {{ node: import('estree').CallExpression, total: number, callOnly: number }[]} */
    const tests = [];

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          tests.push({ node, total: 0, callOnly: 0 });
          return;
        }
        const test = tests.at(-1);
        if (!test) return;
        const matcher = matcherName(node);
        if (!matcher) return;
        test.total += 1;
        if (CALL_ONLY_MATCHERS.has(matcher)) test.callOnly += 1;
      },
      'CallExpression:exit'(node) {
        const test = tests.at(-1);
        if (test?.node !== node) return;
        tests.pop();
        if (test.total > 0 && test.total === test.callOnly) {
          context.report({ messageId: 'callOnlyAssertions', node: node.callee });
        }
      },
    };
  },
};

export default noCallOnlyAssertions;
