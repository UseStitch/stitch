import { createClassTokenVisitor, nearestScaleToken, replaceTailwindUtility } from './class-token-rule.mjs';
import { DURATION_SCALE, EASING_REPLACEMENTS } from './design-system.generated.mjs';
import { getTailwindUtility, isUiComponentFile } from './jsx-style-utils.mjs';

const OFFSCALE_MOTION = /^(?:duration-\d+|ease-(?!standard$|emphasized$).+)$/;

function getMotionReplacement(className) {
  const utility = getTailwindUtility(className);
  const duration = /^duration-(\d+)$/.exec(utility);
  if (duration) {
    const token = nearestScaleToken(Number(duration[1]), DURATION_SCALE);
    return replaceTailwindUtility(className, `duration-${token}`);
  }

  const easing = EASING_REPLACEMENTS.get(utility);
  return easing ? replaceTailwindUtility(className, easing) : null;
}

/** @type {import('eslint').Rule.RuleModule} */
const noOffscaleMotion = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require the named duration and easing scale' },
    fixable: 'code',
    messages: { useMotionToken: 'Replace off-scale motion class(es) {{classes}} with existing motion classes.' },
    schema: [],
  },
  create(context) {
    if (isUiComponentFile(context.filename)) return {};
    return createClassTokenVisitor(context, getMotionReplacement, 'useMotionToken', (className) =>
      OFFSCALE_MOTION.test(getTailwindUtility(className)),
    );
  },
};

export default noOffscaleMotion;
