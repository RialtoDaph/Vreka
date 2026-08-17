import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCalendarAccessToken } from "@/lib/google/credentials";
import { deleteEvent } from "@/lib/google/calendar";

export const dynamic = "force-dynamic";

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = (searchParams.get("eventId") ?? "").trim();
  if (!eventId) {
    return NextResponse.json({ error: "eventId wajib diisi." }, { status: 400 });
  }

  const cred = await getCalendarAccessToken(supabase, user.id);
  if ("error" in cred) {
    return NextResponse.json({ error: cred.error }, { status: 409 });
  }

  try {
    await deleteEvent(cred.accessToken, eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/google/calendar/delete gagal:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal hapus event." },
      { status: 500 }
    );
  }
}
