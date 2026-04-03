import type { GoogleClient } from '../client.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

type CalendarEventRaw = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  htmlLink?: string;
  attendees?: { email: string; displayName?: string; responseStatus?: string }[];
  organizer?: { email: string; displayName?: string };
  created?: string;
  updated?: string;
  conferenceData?: {
    entryPoints?: { entryPointType: string; uri: string }[];
  };
};

type CalendarListResponse = {
  items: CalendarEventRaw[];
  nextPageToken?: string;
};

type CalendarEvent = {
  id: string;
  summary: string | undefined;
  description: string | undefined;
  location: string | undefined;
  start: string | undefined;
  end: string | undefined;
  status: string | undefined;
  htmlLink: string | undefined;
  meetLink: string | undefined;
  attendees: {
    email: string;
    displayName: string | undefined;
    responseStatus: string | undefined;
  }[];
  organizer: { email: string; displayName: string | undefined } | undefined;
};

type CalendarSearchResult = {
  events: CalendarEvent[];
  nextPageToken: string | undefined;
};

function mapEvent(raw: CalendarEventRaw): CalendarEvent {
  const meetLink = raw.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === 'video',
  )?.uri;

  return {
    id: raw.id,
    summary: raw.summary,
    description: raw.description,
    location: raw.location,
    start: raw.start?.dateTime ?? raw.start?.date,
    end: raw.end?.dateTime ?? raw.end?.date,
    status: raw.status,
    htmlLink: raw.htmlLink,
    meetLink,
    attendees:
      raw.attendees?.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: a.responseStatus,
      })) ?? [],
    organizer: raw.organizer
      ? { email: raw.organizer.email, displayName: raw.organizer.displayName }
      : undefined,
  };
}

export async function listEvents(
  client: GoogleClient,
  options?: {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    timeZone?: string;
    maxResults?: number;
    query?: string;
    pageToken?: string;
  },
): Promise<CalendarSearchResult> {
  const calendarId = options?.calendarId ?? 'primary';
  const params = new URLSearchParams({
    maxResults: String(options?.maxResults ?? 10),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  if (options?.timeMin) params.set('timeMin', options.timeMin);
  if (options?.timeMax) params.set('timeMax', options.timeMax);
  if (options?.timeZone) params.set('timeZone', options.timeZone);
  if (options?.query) params.set('q', options.query);
  if (options?.pageToken) params.set('pageToken', options.pageToken);

  // Default to upcoming events if no time range specified
  if (!options?.timeMin && !options?.timeMax) {
    params.set('timeMin', new Date().toISOString());
  }

  const response = await client.request<CalendarListResponse>(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
  );

  return {
    events: response.items.map(mapEvent),
    nextPageToken: response.nextPageToken,
  };
}

export async function getEvent(
  client: GoogleClient,
  eventId: string,
  calendarId = 'primary',
): Promise<CalendarEvent> {
  const raw = await client.request<CalendarEventRaw>(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
  );
  return mapEvent(raw);
}

export async function createEvent(
  client: GoogleClient,
  event: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime: string; timeZone?: string };
    end: { dateTime: string; timeZone?: string };
    attendees?: string[];
    addMeet?: boolean;
  },
  calendarId = 'primary',
): Promise<CalendarEvent> {
  const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
  if (event.addMeet) url.searchParams.set('conferenceDataVersion', '1');

  const body: Record<string, unknown> = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: event.start,
    end: event.end,
    attendees: event.attendees?.map((email) => ({ email })),
  };

  if (event.addMeet) {
    body['conferenceData'] = {
      createRequest: { requestId: `meet-${Date.now()}` },
    };
  }

  const raw = await client.request<CalendarEventRaw>(url.toString(), {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return mapEvent(raw);
}
