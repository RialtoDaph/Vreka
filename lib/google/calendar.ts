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

// Google's error body is JSON like `{ error: { message, errors: [...] } }` --
// callers otherwise end up dumping that raw JSON straight into UI-facing
// error text, so pull out just the human-readable message when we can.
function extractGoogleErrorMessage(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText);
    const message = parsed?.error?.message;
    if (typeof message === "string" && message.trim()) return message;
  } catch {
    // not JSON -- fall through to raw text
  }
  return bodyText;
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
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google Calendar: gagal ambil event (status ${res.status}): ${body}`);
    throw new Error(extractGoogleErrorMessage(body));
  }
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
  if (!res.ok) {
    const body = await res.text();
    console.error(`Google Calendar: gagal bikin event (status ${res.status}): ${body}`);
    throw new Error(extractGoogleErrorMessage(body));
  }
  return parseEvent((await res.json()) as GoogleCalendarEventRaw);
}
