const QUERY_HOOKS = new Set(['useQuery', 'useSuspenseQuery', 'useInfiniteQuery']);

function isTanstackQuerySource(source) {
  return source === '@tanstack/react-query' || source.startsWith('@tanstack/react-query/');
}

function getStaticPropertyName(key, computed) {
  if (computed) return null;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' && typeof key.value === 'string') return key.value;
  return null;
}

function hasSelectOption(optionsObject) {
  return optionsObject.properties.some(
    (prop) => prop.type === 'Property' && getStaticPropertyName(prop.key, prop.computed) === 'select',
  );
}

function getDataLocalName(objectPattern) {
  for (const prop of objectPattern.properties) {
    if (prop.type !== 'Property') continue;
    if (getStaticPropertyName(prop.key, prop.computed) !== 'data') continue;

    const value = prop.value;
    if (value.type === 'Identifier') return value.name;
    if (value.type === 'AssignmentPattern' && value.left.type === 'Identifier') return value.left.name;
    return 'data';
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const requireQuerySelect = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require a select option when destructuring data from TanStack Query hooks',
      url: 'https://tanstack.com/query/latest/docs/framework/react/guides/render-optimizations',
    },
    messages: {
      requireSelect:
        'Add a `select` option to subscribe only to the fields used by this component, e.g. `select: (data) => data.title`. Destructuring the full result means every cache update to this query re-renders the component.',
      requireSelectOnSharedOptions:
        'Subscribe only to the fields used by this component via `{ ...options, select: (data) => data.title }`. Destructuring the full result means every cache update to this query re-renders the component.',
    },
    schema: [],
  },
  create(context) {
    const queryHookNames = new Set();

    return {
      ImportDeclaration(node) {
        if (!isTanstackQuerySource(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && QUERY_HOOKS.has(specifier.imported.name)) {
            queryHookNames.add(specifier.local.name);
          }
        }
      },
      VariableDeclarator(node) {
        const init = node.init;
        if (!init || init.type !== 'CallExpression') return;
        if (init.callee.type !== 'Identifier' || !queryHookNames.has(init.callee.name)) return;

        const optionsArg = init.arguments[0];
        if (!optionsArg) return;

        const isLiteralWithSelect = optionsArg.type === 'ObjectExpression' && hasSelectOption(optionsArg);
        if (isLiteralWithSelect) return;

        if (node.id.type !== 'ObjectPattern') return;
        const dataName = getDataLocalName(node.id);
        if (!dataName) return;

        context.report({
          messageId: optionsArg.type === 'ObjectExpression' ? 'requireSelect' : 'requireSelectOnSharedOptions',
          node: init,
        });
      },
    };
  },
};

export default requireQuerySelect;
