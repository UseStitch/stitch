import { LIQUID_UI_COMPONENTS } from './constants';
import { liquidUiSpecSchema, type LiquidUiSpec } from './schema';

type LiquidUiParseError = {
  code: 'invalid_spec';
  message: string;
  hint: string;
  availableComponents: readonly string[];
};

type LiquidUiParseResult =
  | { ok: true; spec: LiquidUiSpec }
  | { ok: false; error: LiquidUiParseError };

export function parseLiquidUiSpec(input: unknown): LiquidUiParseResult {
  const result = liquidUiSpecSchema.safeParse(input);
  if (result.success) return { ok: true, spec: result.data };

  return {
    ok: false,
    error: {
      code: 'invalid_spec',
      message: result.error.issues.map((issue) => issue.message).join('; '),
      hint: 'Use a flat graph with a valid root, unique node ids, valid child refs, no cycles, and only catalog components/props.',
      availableComponents: LIQUID_UI_COMPONENTS,
    },
  };
}
