import noArbitraryDesignValues from './no-arbitrary-design-values.mjs';
import noCallOnlyAssertions from './no-call-only-assertions.mjs';
import noCollapsibleIf from './no-collapsible-if.mjs';
import noDirectUiPrimitives from './no-direct-ui-primitives.mjs';
import noNativeButton from './no-native-button.mjs';
import noNativeFormControls from './no-native-form-controls.mjs';
import noRawTailwindColors from './no-raw-tailwind-colors.mjs';
import noWindowConfirm from './no-window-confirm.mjs';

/** @type {{ meta: { name: string }, rules: Record<string, unknown> }} */
const plugin = {
  meta: { name: 'stitch' },
  rules: {
    'no-arbitrary-design-values': noArbitraryDesignValues,
    'no-call-only-assertions': noCallOnlyAssertions,
    'no-collapsible-if': noCollapsibleIf,
    'no-direct-ui-primitives': noDirectUiPrimitives,
    'no-native-button': noNativeButton,
    'no-native-form-controls': noNativeFormControls,
    'no-raw-tailwind-colors': noRawTailwindColors,
    'no-window-confirm': noWindowConfirm,
  },
};

export default plugin;
