import { getJsxAttribute, getJsxElementName } from './jsx-style-utils.mjs';

const PRIMITIVE_IMPORT = /^@\/components\/primitives\/(?:icon|stack|text)$/;

/** @type {import('eslint').Rule.RuleModule} */
const noClassnameOnPrimitive = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep design-system primitives closed by forbidding className escape hatches' },
    messages: {
      removeClassName: '{{primitive}} does not accept className; use its closed props or a semantic wrapper.',
    },
    schema: [],
  },
  create(context) {
    const primitives = new Set();

    return {
      ImportDeclaration(node) {
        if (!PRIMITIVE_IMPORT.test(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') primitives.add(specifier.local.name);
        }
      },
      JSXOpeningElement(node) {
        const primitive = getJsxElementName(node);
        if (!primitives.has(primitive)) return;
        const className = getJsxAttribute(node, 'className');
        if (className) context.report({ data: { primitive }, messageId: 'removeClassName', node: className });
      },
    };
  },
};

export default noClassnameOnPrimitive;
