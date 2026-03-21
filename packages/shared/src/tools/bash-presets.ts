import { FAMILY_RULES } from '@stitch/shared/tools/bash-families';

export type BashPreset = {
  pattern: string;
  label: string;
};

export const BASH_COMMON_PRESETS: BashPreset[] = FAMILY_RULES.filter(
  (rule) => rule.showAsPreset,
).map((rule) => ({
  pattern: `${rule.tokens.join(' ')} *`,
  label: rule.tokens.join(' '),
}));
