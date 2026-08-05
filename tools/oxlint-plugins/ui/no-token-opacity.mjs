import { createClassTokenVisitor, replaceTailwindUtility } from './class-token-rule.mjs';
import { TOKEN_OPACITY_REPLACEMENTS } from './design-system.mjs';
import { getTailwindUtility, isUiComponentFile } from './jsx-style-utils.mjs';

const TOKEN_OPACITY =
  /^(?:bg|border(?:-[xytrblse])?|divide(?:-[xy])?|fill|from|outline|ring|shadow|stroke|text|to|via)-[a-z][a-z-]*\/\d+$/;

function getOpacityReplacement(className) {
  const utility = getTailwindUtility(className);
  const replacement =
    (className.includes('hover:') && utility.startsWith('bg-muted/') ? 'bg-accent' : null) ??
    TOKEN_OPACITY_REPLACEMENTS.get(utility);
  return replacement ? replaceTailwindUtility(className, replacement) : null;
}

/** @type {import('eslint').Rule.RuleModule} */
const noTokenOpacity = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require named semantic colors instead of token opacity modifiers' },
    fixable: 'code',
    messages: {
      useNamedTint:
        'Replace token opacity class(es) {{classes}} with an existing semantic color token or remove the opacity modifier.',
    },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};
    return createClassTokenVisitor(context, getOpacityReplacement, 'useNamedTint', (className) =>
      TOKEN_OPACITY.test(getTailwindUtility(className)),
    );
  },
};

export default noTokenOpacity;
