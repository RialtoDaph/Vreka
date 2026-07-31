import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshAccessToken, listMessages, getMessage } from "@/lib/google/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY belum di-set." }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: connections, error } = await admin
    .from("google_credentials")
    .select("user_id, refresh_token");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const anthropic = new Anthropic({ apiKey });
  const results: Array<{ user_id: string; status: string }> = [];

  for (const conn of connections ?? []) {
    try {
      const accessToken = await refreshAccessToken(conn.refresh_token);
      const matches = await listMessages(accessToken, "is:unread in:inbox newer_than:2d", 15);

      if (matches.length === 0) {
        results.push({ user_id: conn.user_id, status: "skip: no unread email" });
        continue;
      }

      const details = await Promise.all(matches.map((m) => getMessage(accessToken, m.id)));
      const emailList = details
        .map((d) => `- Dari: ${d.from}\n  Subjek: ${d.subject}\n  Cuplikan: ${d.snippet}`)
        .join("\n");

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 500,
        system:
          "Kamu bikin ringkasan email masuk buat user, Bahasa Indonesia santai. Fokus ke email yang keliatan penting/butuh respon (ada pertanyaan, permintaan meeting, deadline, tagihan). Format singkat per-poin, jangan bertele-tele. Email yang keliatan cuma notifikasi/promosi boleh diringkas jadi satu baris gabungan atau di-skip.",
        messages: [
          {
            role: "user",
            content: `Ada ${details.length} email belum dibaca dalam 2 hari terakhir:\n\n${emailList}\n\nBikin ringkasan singkat, dan tandain mana yang kayaknya perlu dibales.`,
          },
        ],
      });

      const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
      const digest = textBlock?.text?.trim();
      if (digest) {
        await admin.from("assistant_messages").insert({
          user_id: conn.user_id,
          role: "assistant",
          content: `📬 Ringkasan email hari ini:\n\n${digest}`,
        });
        results.push({ user_id: conn.user_id, status: "digest posted" });
      } else {
        results.push({ user_id: conn.user_id, status: "skip: empty digest" });
      }
    } catch (err) {
      results.push({
        user_id: conn.user_id,
        status: `error: ${err instanceof Error ? err.message : "unknown"}`,
      });
    }
  }

  return NextResponse.json({ results });
}
