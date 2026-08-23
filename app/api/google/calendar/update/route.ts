import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCalendarAccessToken } from "@/lib/google/credentials";
import { updateEvent } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const eventId = String(body?.eventId ?? "").trim();
  const summary = body?.summary !== undefined ? String(body.summary).trim() : undefined;
  const start = body?.start !== undefined ? String(body.start).trim() : undefined;
  const end = body?.end !== undefined ? String(body.end).trim() : undefined;
  const description = body?.description !== undefined ? String(body.description) : undefined;
  if (!eventId) {
    return NextResponse.json({ error: "eventId wajib diisi." }, { status: 400 });
  }

  const cred = await getCalendarAccessToken(supabase, user.id);
  if ("error" in cred) {
    return NextResponse.json({ error: cred.error }, { status: 409 });
  }

  try {
    const event = await updateEvent(cred.accessToken, eventId, { summary, startIso: start, endIso: end, description });
    return NextResponse.json({ event });
  } catch (err) {
    console.error("PATCH /api/google/calendar/update gagal:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal update event." },
      { status: 500 }
    );
  }
}
