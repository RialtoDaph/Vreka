import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCalendarAccessToken } from "@/lib/google/credentials";
import { listUpcomingEvents } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) {
    return NextResponse.json({ error: "from/to wajib diisi." }, { status: 400 });
  }

  const cred = await getCalendarAccessToken(supabase, user.id);
  if ("error" in cred) {
    // Bukan error fatal buat kalender terpadu — cuma berarti Calendar belum
    // di-connect, view-nya tetap jalan tanpa event Google.
    return NextResponse.json({ connected: false, events: [] });
  }

  try {
    const events = await listUpcomingEvents(cred.accessToken, {
      maxResults: 50,
      timeMin: new Date(from),
      timeMax: new Date(to),
    });
    return NextResponse.json({ connected: true, events });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal ambil kalender." },
      { status: 500 }
    );
  }
}
