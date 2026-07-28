import { getJsxAttribute, getJsxElementName, isUiComponentFile } from './jsx-style-utils.mjs';

const FORM_CONTROLS = new Set(['input', 'select', 'textarea']);

function isUtilityInput(node) {
  if (getJsxElementName(node) !== 'input') return false;

  const typeAttribute = getJsxAttribute(node, 'type');
  return (
    typeAttribute?.value?.type === 'Literal' &&
    (typeAttribute.value.value === 'file' || typeAttribute.value.value === 'hidden')
  );
}

/** @type {import('eslint').Rule.RuleModule} */
const noNativeFormControls = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require shared form controls instead of native JSX elements' },
    messages: {
      useSharedControl: 'Use the shared {{component}} component instead of a native <{{element}}> element.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};

    return {
      JSXOpeningElement(node) {
        const element = getJsxElementName(node);
        if (!element || !FORM_CONTROLS.has(element) || isUtilityInput(node)) return;

        const component = element === 'textarea' ? 'Textarea' : element === 'select' ? 'Select' : 'Input';
        context.report({ data: { component, element }, messageId: 'useSharedControl', node: node.name });
      },
    };
  },
};

export default noNativeFormControls;
