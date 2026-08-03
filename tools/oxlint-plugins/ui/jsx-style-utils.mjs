import { VENDORED_UI_FILES } from './design-system.mjs';

function isUiComponentFile(filename) {
  const normalized = filename.replaceAll('\\', '/');
  for (const vendoredFile of VENDORED_UI_FILES) {
    if (normalized.endsWith(`/${vendoredFile}`) || normalized === vendoredFile) return true;
  }
  return false;
}

function isDesignSystemPrimitiveFile(filename) {
  return /(?:^|\/)apps\/web\/src\/components\/primitives\/(?:icon|stack|text)\.[jt]sx?$/.test(
    filename.replaceAll('\\', '/'),
  );
}

function getJsxElementName(node) {
  return node.name.type === 'JSXIdentifier' ? node.name.name : null;
}

function getJsxAttribute(node, name) {
  return node.attributes.find(
    (attribute) =>
      attribute.type === 'JSXAttribute' && attribute.name.type === 'JSXIdentifier' && attribute.name.name === name,
  );
}

function collectStaticStrings(node, strings = []) {
  if (!node) return strings;

  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string') strings.push(node.value);
      break;
    case 'TemplateLiteral':
      for (const quasi of node.quasis) strings.push(quasi.value.cooked ?? quasi.value.raw);
      for (const expression of node.expressions) collectStaticStrings(expression, strings);
      break;
    case 'JSXExpressionContainer':
      collectStaticStrings(node.expression, strings);
      break;
    case 'CallExpression':
    case 'NewExpression':
      for (const argument of node.arguments) {
        if (argument.type !== 'SpreadElement') collectStaticStrings(argument, strings);
      }
      break;
    case 'ConditionalExpression':
      collectStaticStrings(node.consequent, strings);
      collectStaticStrings(node.alternate, strings);
      break;
    case 'LogicalExpression':
      collectStaticStrings(node.left, strings);
      collectStaticStrings(node.right, strings);
      break;
    case 'ArrayExpression':
      for (const element of node.elements) collectStaticStrings(element, strings);
      break;
    case 'ObjectExpression':
      for (const property of node.properties) {
        if (property.type === 'Property') {
          if (!property.computed) collectStaticStrings(property.key, strings);
          collectStaticStrings(property.value, strings);
        }
      }
      break;
  }

  return strings;
}

function getStaticClassNames(openingElement) {
  const attribute = getJsxAttribute(openingElement, 'className');
  if (!attribute?.value) return [];

  return collectStaticStrings(attribute.value)
    .flatMap((value) => value.split(/\s+/))
    .filter(Boolean);
}

function getTailwindUtility(className) {
  let bracketDepth = 0;
  let variantEnd = -1;

  for (let index = 0; index < className.length; index += 1) {
    const character = className[index];
    if (character === '[' || character === '(') bracketDepth += 1;
    if (character === ']' || character === ')') bracketDepth -= 1;
    if (character === ':' && bracketDepth === 0) variantEnd = index;
  }

  return className
    .slice(variantEnd + 1)
    .replace(/^!/, '')
    .replace(/^-/, '');
}

export {
  getJsxAttribute,
  getJsxElementName,
  getStaticClassNames,
  getTailwindUtility,
  isDesignSystemPrimitiveFile,
  isUiComponentFile,
};
