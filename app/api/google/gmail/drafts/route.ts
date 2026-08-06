import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGmailAccessToken } from "@/lib/google/credentials";
import { listDrafts } from "@/lib/google/gmail";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const accessToken = await getGmailAccessToken(supabase, user.id);
  if (!accessToken) {
    return NextResponse.json({ connected: false, drafts: [] });
  }

  try {
    const drafts = await listDrafts(accessToken);
    return NextResponse.json({ connected: true, drafts });
  } catch (err) {
    console.error("GET /api/google/gmail/drafts gagal:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal ambil draft." },
      { status: 500 }
    );
  }
}
