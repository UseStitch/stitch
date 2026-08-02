import { createClassTokenVisitor, replaceTailwindUtility } from './class-token-rule.mjs';
import { RADIUS_REPLACEMENTS } from './design-system.generated.mjs';
import { getTailwindUtility, isUiComponentFile } from './jsx-style-utils.mjs';

function getRadiusReplacement(className) {
  const utility = getTailwindUtility(className);
  const replacement = RADIUS_REPLACEMENTS.get(utility);
  return replacement ? replaceTailwindUtility(className, replacement) : null;
}

/** @type {import('eslint').Rule.RuleModule} */
const noOffscaleRadius = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require theme-aware radius tokens' },
    fixable: 'code',
    messages: { useRadiusToken: 'Replace off-scale radius class(es) {{classes}} with existing theme-aware classes.' },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};
    return createClassTokenVisitor(context, getRadiusReplacement, 'useRadiusToken');
  },
};

export default noOffscaleRadius;
