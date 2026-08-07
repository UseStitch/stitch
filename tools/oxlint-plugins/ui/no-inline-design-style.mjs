import { getJsxAttribute, isUiComponentFile } from './jsx-style-utils.mjs';

const RUNTIME_STYLE_PROPERTIES = new Set([
  'WebkitAppRegion',
  'WebkitMask',
  'gridTemplateRows',
  'height',
  'left',
  'mask',
  'top',
  'transform',
  'viewTransitionName',
  'width',
]);

function getPropertyName(property) {
  if (property.computed || property.key.type !== 'Identifier') return null;
  return property.key.name;
}

/** @type {import('eslint').Rule.RuleModule} */
const noInlineDesignStyle = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid inline visual styling while allowing runtime geometry and platform integration' },
    messages: {
      useSupportedApi:
        'Inline style property "{{property}}" bypasses the design system; use an existing component prop or variant.',
      useStaticObject: 'Inline styles must be an object containing only runtime geometry or platform properties.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};

    return {
      JSXOpeningElement(node) {
        const style = getJsxAttribute(node, 'style');
        if (!style) return;
        let expression = style.value?.type === 'JSXExpressionContainer' ? style.value.expression : null;
        if (expression?.type === 'TSAsExpression') expression = expression.expression;
        if (expression?.type !== 'ObjectExpression') {
          context.report({ messageId: 'useStaticObject', node: style });
          return;
        }
        for (const property of expression.properties) {
          if (property.type !== 'Property') {
            context.report({ messageId: 'useStaticObject', node: property });
            continue;
          }
          const propertyName = getPropertyName(property);
          if (!propertyName || !RUNTIME_STYLE_PROPERTIES.has(propertyName)) {
            context.report({
              data: { property: propertyName ?? 'computed' },
              messageId: 'useSupportedApi',
              node: property,
            });
          }
        }
      },
    };
  },
};

export default noInlineDesignStyle;
