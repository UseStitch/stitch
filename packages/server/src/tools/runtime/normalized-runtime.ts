import { resultNormalizationMiddleware } from '@/tools/runtime/middleware.js';
import { createToolRuntime } from '@/tools/runtime/runtime.js';
import type { ToolRuntimeContext } from '@/tools/runtime/runtime.js';

export function createNormalizedToolRuntime(context: ToolRuntimeContext) {
  return createToolRuntime(context).use(resultNormalizationMiddleware());
}
