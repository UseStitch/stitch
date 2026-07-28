import { getJsxAttribute, getStaticClassNames } from './jsx-style-utils.mjs';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getClassTokenRanges(attribute, className, sourceCode) {
  const source = sourceCode.getText(attribute);
  const pattern = new RegExp(`(^|[\\s'"\`])${escapeRegExp(className)}(?=$|[\\s'"\`])`, 'g');
  const ranges = [];
  for (const match of source.matchAll(pattern)) {
    const start = attribute.range[0] + match.index + match[1].length;
    ranges.push([start, start + className.length]);
  }
  return ranges;
}

function replaceTailwindUtility(className, replacement) {
  let bracketDepth = 0;
  let utilityStart = 0;

  for (let index = 0; index < className.length; index += 1) {
    const character = className[index];
    if (character === '[' || character === '(') bracketDepth += 1;
    if (character === ']' || character === ')') bracketDepth -= 1;
    if (character === ':' && bracketDepth === 0) utilityStart = index + 1;
  }

  const rawUtility = className.slice(utilityStart);
  const modifier = rawUtility.match(/^!?-?/)?.[0] ?? '';
  return `${className.slice(0, utilityStart)}${modifier}${replacement}`;
}

function createClassTokenVisitor(
  context,
  getReplacement,
  messageId,
  isViolation = (className) => getReplacement(className),
) {
  return {
    JSXOpeningElement(node) {
      const attribute = getJsxAttribute(node, 'className');
      for (const className of new Set(getStaticClassNames(node))) {
        if (!isViolation(className)) continue;
        const replacement = getReplacement(className, node);
        const ranges = getClassTokenRanges(attribute, className, context.sourceCode);
        if (ranges.length === 0) {
          context.report({ data: { classes: className }, messageId, node: attribute });
          continue;
        }
        for (const range of ranges) {
          const report = { data: { classes: className }, messageId, node: attribute };
          if (replacement && replacement !== className) {
            report.fix = (fixer) => fixer.replaceTextRange(range, replacement);
          }
          context.report(report);
        }
      }
    },
  };
}

function nearestScaleToken(value, scale) {
  let nearest = scale[0];
  for (const candidate of scale) {
    if (Math.abs(candidate[0] - value) < Math.abs(nearest[0] - value)) nearest = candidate;
  }
  return nearest[1];
}

export { createClassTokenVisitor, nearestScaleToken, replaceTailwindUtility };
