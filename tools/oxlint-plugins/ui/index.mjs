import noArbitraryDesignValues from './no-arbitrary-design-values.mjs';
import noClassnameOnPrimitive from './no-classname-on-primitive.mjs';
import noComponentAppearanceClassname from './no-component-appearance-classname.mjs';
import noDarkVariant from './no-dark-variant.mjs';
import noDirectUiPrimitives from './no-direct-ui-primitives.mjs';
import noIconDimensionClasses from './no-icon-dimension-classes.mjs';
import noInlineDesignStyle from './no-inline-design-style.mjs';
import noNativeButton from './no-native-button.mjs';
import noNativeFormControls from './no-native-form-controls.mjs';
import noOffscaleIconSize from './no-offscale-icon-size.mjs';
import noOffscaleMotion from './no-offscale-motion.mjs';
import noOffscaleRadius from './no-offscale-radius.mjs';
import noOffscaleSpacing from './no-offscale-spacing.mjs';
import noRawLayoutDiv from './no-raw-layout-div.mjs';
import noRawSemanticLayout from './no-raw-semantic-layout.mjs';
import noRawTailwindColors from './no-raw-tailwind-colors.mjs';
import noRawTextElement from './no-raw-text-element.mjs';
import noRawTypographyElement from './no-raw-typography-element.mjs';
import noTokenOpacity from './no-token-opacity.mjs';

const uiRules = {
  'no-arbitrary-design-values': noArbitraryDesignValues,
  'no-classname-on-primitive': noClassnameOnPrimitive,
  'no-direct-ui-primitives': noDirectUiPrimitives,
  'no-dark-variant': noDarkVariant,
  'no-component-appearance-classname': noComponentAppearanceClassname,
  'no-inline-design-style': noInlineDesignStyle,
  'no-icon-dimension-classes': noIconDimensionClasses,
  'no-native-button': noNativeButton,
  'no-native-form-controls': noNativeFormControls,
  'no-offscale-icon-size': noOffscaleIconSize,
  'no-offscale-motion': noOffscaleMotion,
  'no-offscale-radius': noOffscaleRadius,
  'no-offscale-spacing': noOffscaleSpacing,
  'no-raw-layout-div': noRawLayoutDiv,
  'no-raw-semantic-layout': noRawSemanticLayout,
  'no-raw-tailwind-colors': noRawTailwindColors,
  'no-raw-text-element': noRawTextElement,
  'no-raw-typography-element': noRawTypographyElement,
  'no-token-opacity': noTokenOpacity,
};

export default uiRules;
