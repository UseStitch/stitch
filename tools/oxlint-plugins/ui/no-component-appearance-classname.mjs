import {
  getJsxAttribute,
  getJsxElementName,
  getStaticClassNames,
  getTailwindUtility,
  isUiComponentFile,
} from './jsx-style-utils.mjs';

const UI_COMPONENT_IMPORT = /^@\/components\/ui\//;
const VARIANT_COMPONENTS = new Set(['Badge', 'Button', 'Kbd', 'Spinner', 'StatusDot', 'Toggle']);
const APPEARANCE_UTILITY =
  /^(?:animate-|backdrop-|bg-|border(?:-|$)|decoration-|divide-|duration-|ease-|fill-|font-|h-|leading-|opacity-|outline-|p[xytrblse]?-|ring-|rounded(?:-|$)|shadow(?:-|$)|size-|stroke-|text-|tracking-|transition(?:-|$)|w-)/;

/** @type {import('eslint').Rule.RuleModule} */
const noComponentAppearanceClassname = {
  meta: {
    type: 'problem',
    docs: { description: 'Require shared UI components to express appearance through their variants' },
    messages: {
      useVariant:
        'Remove appearance class "{{className}}" from <{{component}}> and use an existing component prop or variant.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};
    const components = new Set();

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== 'string' || !UI_COMPONENT_IMPORT.test(node.source.value)) return;
        for (const specifier of node.specifiers) {
          if (
            (specifier.type === 'ImportSpecifier' || specifier.type === 'ImportDefaultSpecifier') &&
            VARIANT_COMPONENTS.has(specifier.imported?.name ?? specifier.local.name)
          ) {
            components.add(specifier.local.name);
          }
        }
      },
      JSXOpeningElement(node) {
        const component = getJsxElementName(node);
        if (!component || !components.has(component) || !getJsxAttribute(node, 'className')) return;
        for (const className of getStaticClassNames(node)) {
          if (APPEARANCE_UTILITY.test(getTailwindUtility(className))) {
            context.report({ data: { className, component }, messageId: 'useVariant', node });
          }
        }
      },
    };
  },
};

export default noComponentAppearanceClassname;
