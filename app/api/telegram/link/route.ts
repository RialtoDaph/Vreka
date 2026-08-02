import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CODE_TTL_MS = 15 * 60 * 1000;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) {
    return NextResponse.json(
      { error: "TELEGRAM_BOT_USERNAME belum di-set di server." },
      { status: 500 }
    );
  }

  const code = randomBytes(9).toString("base64url");
  const codeExpiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error } = await supabase.from("telegram_links").upsert(
    {
      user_id: user.id,
      link_code: code,
      code_expires_at: codeExpiresAt,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    deepLink: `https://t.me/${botUsername}?start=${code}`,
    expiresAt: codeExpiresAt,
  });
}
