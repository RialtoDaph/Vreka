import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGmailAccessToken } from "@/lib/google/credentials";
import { deleteDraft } from "@/lib/google/gmail";

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
  const draftId = typeof body?.id === "string" ? body.id : "";
  if (!draftId) {
    return NextResponse.json({ error: "id draft kosong." }, { status: 400 });
  }

  const accessToken = await getGmailAccessToken(supabase, user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Gmail belum di-connect." }, { status: 400 });
  }

  try {
    await deleteDraft(accessToken, draftId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/google/gmail/drafts/delete gagal:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal hapus draft." },
      { status: 500 }
    );
  }
}
