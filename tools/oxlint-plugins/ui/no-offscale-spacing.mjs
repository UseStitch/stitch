import { createClassTokenVisitor, nearestScaleToken, replaceTailwindUtility } from './class-token-rule.mjs';
import { SPACING_SCALE } from './design-system.mjs';
import { getTailwindUtility, isUiComponentFile } from './jsx-style-utils.mjs';

const SPACING_UTILITY =
  /^(?<prefix>(?:gap(?:-[xy])?|m[xytrblse]?|p[xytrblse]?|space-[xy])-)(?<value>\d+(?:\.\d+)?|none|2xs|xs|s|m|l|xl|2xl|3xl)$/;

function getSpacingReplacement(className) {
  const match = SPACING_UTILITY.exec(getTailwindUtility(className));
  if (!match?.groups) return null;
  const numericValue = Number(match.groups.value);
  const token = Number.isNaN(numericValue)
    ? `space-${match.groups.value}`
    : nearestScaleToken(numericValue, SPACING_SCALE);
  return replaceTailwindUtility(className, `${match.groups.prefix}${token}`);
}

/** @type {import('eslint').Rule.RuleModule} */
const noOffscaleSpacing = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require the named spacing scale for spacing utilities' },
    fixable: 'code',
    messages: { useSpacingToken: 'Replace numeric spacing class(es) {{classes}} with existing named spacing classes.' },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};
    return createClassTokenVisitor(context, getSpacingReplacement, 'useSpacingToken', (className) =>
      SPACING_UTILITY.test(getTailwindUtility(className)),
    );
  },
};

export default noOffscaleSpacing;
