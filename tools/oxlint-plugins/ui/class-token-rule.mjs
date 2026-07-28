function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getClassTokenRanges(node, className, sourceCode) {
  const source = sourceCode.getText(node);
  const pattern = new RegExp(`(^|[\\s'"\`])${escapeRegExp(className)}(?=$|[\\s'"\`])`, 'g');
  const ranges = [];
  for (const match of source.matchAll(pattern)) {
    const start = node.range[0] + match.index + match[1].length;
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
  if (context.filename.replaceAll('\\', '/').endsWith('/apps/web/src/styles/tokens.ts')) return {};

  function checkStaticString(node, value) {
    if (typeof value !== 'string') return;
    for (const className of new Set(value.split(/\s+/).filter(Boolean))) {
      if (!isViolation(className)) continue;
      const replacement = getReplacement(className, node);
      const ranges = getClassTokenRanges(node, className, context.sourceCode);
      if (ranges.length === 0) {
        context.report({ data: { classes: className }, messageId, node });
        continue;
      }
      for (const range of ranges) {
        const report = { data: { classes: className }, messageId, node };
        if (replacement && replacement !== className) {
          report.fix = (fixer) => fixer.replaceTextRange(range, replacement);
        }
        context.report(report);
      }
    }
  }

  return {
    Literal(node) {
      checkStaticString(node, node.value);
    },
    TemplateElement(node) {
      checkStaticString(node, node.value.raw);
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
