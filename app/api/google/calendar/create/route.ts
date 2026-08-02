import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCalendarAccessToken } from "@/lib/google/credentials";
import { createEvent } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const summary = String(body?.summary ?? "").trim();
  const start = String(body?.start ?? "").trim();
  const end = String(body?.end ?? "").trim();
  const description = body?.description ? String(body.description) : undefined;
  if (!summary || !start || !end) {
    return NextResponse.json({ error: "summary/start/end wajib diisi." }, { status: 400 });
  }

  const cred = await getCalendarAccessToken(supabase, user.id);
  if ("error" in cred) {
    return NextResponse.json({ error: cred.error }, { status: 409 });
  }

  try {
    const event = await createEvent(cred.accessToken, { summary, startIso: start, endIso: end, description });
    return NextResponse.json({ event });
  } catch (err) {
    console.error("POST /api/google/calendar/create gagal:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal bikin event." },
      { status: 500 }
    );
  }
}
