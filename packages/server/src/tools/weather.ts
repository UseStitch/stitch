import { tool } from 'ai';
import { z } from 'zod';

import type { PermissionSuggestion } from '@openwork/shared';

import type { ToolContext } from '@/tools/wrappers.js';
import { withPermissionGate, withTruncation } from '@/tools/wrappers.js';

const weatherInputSchema = z.object({
  location: z.string().describe('City name or location to get weather for'),
  unit: z
    .enum(['celsius', 'fahrenheit'])
    .optional()
    .describe('Temperature unit, defaults to celsius'),
});

export function createWeatherTool() {
  return tool({
    description: 'Get the current weather for a location',
    inputSchema: weatherInputSchema,
    execute: async (input) => {
      // Simulated weather data — replace with a real API call
      const conditions = ['sunny', 'cloudy', 'rainy', 'partly cloudy', 'windy'];
      const condition = conditions[Math.floor(Math.random() * conditions.length)] ?? 'sunny';
      const baseTemp = 15 + Math.floor(Math.random() * 20);
      const unit = input.unit ?? 'celsius';
      const temperature = unit === 'fahrenheit' ? Math.round((baseTemp * 9) / 5 + 32) : baseTemp;

      return {
        location: input.location,
        temperature,
        unit,
        condition,
        humidity: 40 + Math.floor(Math.random() * 40),
      };
    },
  });
}

export function createTool() {
  return createWeatherTool();
}

export function getPatternTargets(input: unknown): string[] {
  const location = (input as { location?: unknown })?.location;
  return typeof location === 'string' && location.length > 0 ? [location] : [];
}

export function getSuggestion(input: unknown): PermissionSuggestion | null {
  const location = (input as { location?: unknown })?.location;
  if (typeof location !== 'string' || location.length === 0) return null;
  return {
    message: `Always allow weather for ${location}`,
    pattern: location,
  };
}

export const shouldTruncate = true;

export function createRegisteredTool(context: ToolContext) {
  const baseTool = createTool();
  const gatedTool = withPermissionGate(
    'weather',
    {
      getPatternTargets,
      getSuggestion,
    },
    baseTool,
    context,
  );

  return shouldTruncate ? withTruncation(gatedTool) : gatedTool;
}
