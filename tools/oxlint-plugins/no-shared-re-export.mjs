// Re-exporting symbols from @stitch/shared through an intermediate module forces
// consumers into indirection. Every consumer should import from @stitch/shared directly.

const SHARED_PACKAGE = '@stitch/shared';

function isSharedSource(source) {
  const value = source?.value;
  return typeof value === 'string' && (value === SHARED_PACKAGE || value.startsWith(`${SHARED_PACKAGE}/`));
}

function nameOf(identifierOrLiteral) {
  return identifierOrLiteral.type === 'Identifier' ? identifierOrLiteral.name : identifierOrLiteral.value;
}

/** @type {import('eslint').Rule.RuleModule} */
const noSharedReExport = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow re-exporting symbols from @stitch/shared through intermediate modules' },
    messages: {
      directReExport:
        "Re-exporting {{names}} from '{{source}}' creates pass-through indirection. Import from '{{source}}' directly where the symbols are used.",
      indirectReExport:
        "Re-exporting {{names}} forwards symbols imported from '{{sources}}'. Import from {{sources}} directly instead of through this module.",
    },
    schema: [],
  },
  create(context) {
    const sharedImports = new Map();

    return {
      ImportDeclaration(node) {
        if (!isSharedSource(node.source)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            sharedImports.set(specifier.local.name, node.source.value);
          }
        }
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          if (isSharedSource(node.source)) {
            context.report({
              node,
              messageId: 'directReExport',
              data: {
                names: node.specifiers.map((specifier) => nameOf(specifier.exported)).join(', '),
                source: node.source.value,
              },
            });
          }
          return;
        }
        const names = [];
        const sources = new Set();
        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ExportSpecifier') continue;
          const source = sharedImports.get(nameOf(specifier.local));
          if (source) {
            names.push(nameOf(specifier.exported));
            sources.add(source);
          }
        }
        if (names.length > 0) {
          context.report({
            node,
            messageId: 'indirectReExport',
            data: {
              names: names.join(', '),
              sources: [...sources].toSorted((a, b) => a.localeCompare(b)).join("', '"),
            },
          });
        }
      },
      ExportAllDeclaration(node) {
        if (isSharedSource(node.source)) {
          context.report({ node, messageId: 'directReExport', data: { names: '*', source: node.source.value } });
        }
      },
    };
  },
};

export default noSharedReExport;
