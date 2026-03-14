import { tool } from 'ai';
import { z } from 'zod';
import { weatherInputSchema, executeWeather } from './weather.js';

export const TOOL_DEFINITIONS = {
  weather: tool({
    description: 'Get the current weather for a location',
    inputSchema: weatherInputSchema,
  }),
};

export const TOOL_EXECUTORS: Record<
  string,
  { inputSchema: z.ZodTypeAny; execute: (input: unknown) => Promise<unknown> }
> = {
  weather: {
    inputSchema: weatherInputSchema,
    execute: (input) => executeWeather(weatherInputSchema.parse(input)),
  },
};
