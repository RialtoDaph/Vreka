const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// Requested alongside GMAIL_SCOPES at OAuth start — same "Connect Gmail"
// button/connection grants both. Users who connected before this scope was
// added need to reconnect (Google won't retroactively grant it to an
// existing refresh token).
export const CALENDAR_SCOPES =
  "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";

type GoogleCalendarEventRaw = {
  id: string;
  summary?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

export type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  location: string | null;
};

function parseEvent(raw: GoogleCalendarEventRaw): CalendarEvent {
  return {
    id: raw.id,
    summary: raw.summary ?? "(tanpa judul)",
    start: raw.start?.dateTime ?? raw.start?.date ?? "",
    end: raw.end?.dateTime ?? raw.end?.date ?? "",
    location: raw.location ?? null,
  };
}

export async function listUpcomingEvents(
  accessToken: string,
  opts: { maxResults?: number; timeMin?: Date; timeMax?: Date } = {}
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: (opts.timeMin ?? new Date()).toISOString(),
    maxResults: String(opts.maxResults ?? 10),
    singleEvents: "true",
    orderBy: "startTime",
  });
  if (opts.timeMax) params.set("timeMax", opts.timeMax.toISOString());

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gagal ambil event kalender: ${await res.text()}`);
  const data = await res.json();
  return ((data.items ?? []) as GoogleCalendarEventRaw[]).map(parseEvent);
}

export async function createEvent(
  accessToken: string,
  params: { summary: string; startIso: string; endIso: string; description?: string }
): Promise<CalendarEvent> {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.startIso },
      end: { dateTime: params.endIso },
    }),
  });
  if (!res.ok) throw new Error(`Gagal bikin event kalender: ${await res.text()}`);
  return parseEvent((await res.json()) as GoogleCalendarEventRaw);
}
