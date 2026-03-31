import { tool, type Tool } from 'ai';
import { z } from 'zod';

import type { GoogleClient } from '../client.js';
import * as CalendarApi from './api.js';

const calendarListSchema = z.object({
  account: z.string().optional().describe('Optional account email or label when multiple Google accounts are connected'),
  query: z.string().optional().describe('Free-text search across event fields'),
  timeMin: z
    .string()
    .optional()
    .describe('Start of time range (ISO 8601, e.g. "2025-01-01T00:00:00Z"). Defaults to now.'),
  timeMax: z.string().optional().describe('End of time range (ISO 8601)'),
  maxResults: z.number().optional().default(10).describe('Max events to return (default 10)'),
  calendarId: z
    .string()
    .optional()
    .describe('Calendar ID to query (defaults to primary calendar)'),
});

const calendarGetSchema = z.object({
  account: z.string().optional().describe('Optional account email or label when multiple Google accounts are connected'),
  eventId: z.string().describe('The calendar event ID'),
  calendarId: z.string().optional().describe('Calendar ID (defaults to primary)'),
});

const calendarCreateSchema = z.object({
  account: z.string().optional().describe('Optional account email or label when multiple Google accounts are connected'),
  summary: z.string().describe('Event title'),
  description: z.string().optional().describe('Event description'),
  location: z.string().optional().describe('Event location'),
  startDateTime: z.string().describe('Start time (ISO 8601, e.g. "2025-06-15T10:00:00-05:00")'),
  endDateTime: z.string().describe('End time (ISO 8601)'),
  timeZone: z.string().optional().describe('Time zone (e.g. "America/Chicago"). Defaults to UTC.'),
  attendees: z.array(z.string()).optional().describe('List of attendee email addresses'),
  calendarId: z.string().optional().describe('Calendar ID (defaults to primary)'),
});

export function createCalendarTools(
  resolveClient: (account?: string) => Promise<{ client: GoogleClient; usedAccount: string | null }>,
  hasWrite: boolean,
) {
  const tools: Record<string, Tool> = {
    calendar_list: tool({
      description:
        'List upcoming Google Calendar events. Defaults to upcoming events from now. Supports filtering by date range and text query.',
      inputSchema: calendarListSchema,
      execute: async (input: z.infer<typeof calendarListSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await CalendarApi.listEvents(client, {
          query: input.query,
          timeMin: input.timeMin,
          timeMax: input.timeMax,
          maxResults: input.maxResults,
          calendarId: input.calendarId,
        });
        return { ...result, usedAccount };
      },
    }),
    calendar_get: tool({
      description: 'Get full details for a specific Google Calendar event by its ID.',
      inputSchema: calendarGetSchema,
      execute: async (input: z.infer<typeof calendarGetSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await CalendarApi.getEvent(client, input.eventId, input.calendarId);
        return { ...result, usedAccount };
      },
    }),
  };

  if (hasWrite) {
    tools['calendar_create'] = tool({
      description: 'Create a new Google Calendar event with a title, time, and optional attendees.',
      inputSchema: calendarCreateSchema,
      execute: async (input: z.infer<typeof calendarCreateSchema>) => {
        const { client, usedAccount } = await resolveClient(input.account);
        const result = await CalendarApi.createEvent(
          client,
          {
            summary: input.summary,
            description: input.description,
            location: input.location,
            start: { dateTime: input.startDateTime, timeZone: input.timeZone },
            end: { dateTime: input.endDateTime, timeZone: input.timeZone },
            attendees: input.attendees,
          },
          input.calendarId,
        );
        return { ...result, usedAccount };
      },
    });
  }

  return tools;
}

export const CALENDAR_TOOL_SUMMARIES = [
  { name: 'calendar_list', description: 'List upcoming Google Calendar events with optional date/text filtering' },
  { name: 'calendar_get', description: 'Get full details for a specific calendar event' },
  { name: 'calendar_create', description: 'Create a new calendar event (requires write access)' },
];
