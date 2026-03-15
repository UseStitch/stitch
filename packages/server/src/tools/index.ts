import { z } from 'zod';
import { weatherInputSchema, weatherTool, executeWeather } from './weather.js';

export const TOOL_DEFINITIONS = {
  weather: weatherTool,
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
