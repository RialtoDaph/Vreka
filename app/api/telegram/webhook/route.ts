import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAssistantChat } from "@/lib/assistant/run";
import { sendTelegramMessage, type TelegramUpdate } from "@/lib/telegram/bot";
import { DEFAULT_ASSISTANT_MODEL } from "@/lib/assistant/models";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TELEGRAM_RATE_LIMIT = 20;
const TELEGRAM_RATE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();

  if (!chatId || !text) {
    return NextResponse.json({ ok: true });
  }

  const admin = createAdminClient();

  if (text.startsWith("/start")) {
    const code = text.slice("/start".length).trim();
    if (!code) {
      await sendTelegramMessage(
        chatId,
        "Halo! Buka dashboard Vreka → halaman Aslan → tombol \"Connect Telegram\" buat nyambungin akun kamu ke sini dulu."
      );
      return NextResponse.json({ ok: true });
    }

    const { data: pending } = await admin
      .from("telegram_links")
      .select("user_id, code_expires_at")
      .eq("link_code", code)
      .maybeSingle();

    if (!pending || !pending.code_expires_at || new Date(pending.code_expires_at) < new Date()) {
      await sendTelegramMessage(
        chatId,
        "Kode nggak valid atau udah expired. Generate kode baru dari dashboard Vreka."
      );
      return NextResponse.json({ ok: true });
    }

    await admin
      .from("telegram_links")
      .update({
        chat_id: chatId,
        telegram_username: message?.from?.username ?? null,
        linked_at: new Date().toISOString(),
        link_code: null,
        code_expires_at: null,
      })
      .eq("user_id", pending.user_id);

    await sendTelegramMessage(
      chatId,
      "✅ Berhasil terhubung ke Vreka! Sekarang kamu bisa langsung ngobrol sama Aslan dari sini — nanya kondisi keuangan, nyatet transaksi, nambah to-do, dll."
    );
    return NextResponse.json({ ok: true });
  }

  const { data: link } = await admin
    .from("telegram_links")
    .select("user_id")
    .eq("chat_id", chatId)
    .not("linked_at", "is", null)
    .maybeSingle();

  if (!link) {
    await sendTelegramMessage(
      chatId,
      "Akun Telegram kamu belum terhubung ke Vreka. Buka dashboard Vreka → halaman Aslan → \"Connect Telegram\" buat nyambungin dulu."
    );
    return NextResponse.json({ ok: true });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await sendTelegramMessage(chatId, "Maaf, asisten lagi nggak bisa dipakai (server belum dikonfigurasi).");
    return NextResponse.json({ ok: true });
  }

  const limit = checkRateLimit(`telegram:${chatId}`, TELEGRAM_RATE_LIMIT, TELEGRAM_RATE_WINDOW_MS);
  if (!limit.ok) {
    await sendTelegramMessage(chatId, "Kebanyakan pesan, tunggu bentar ya.");
    return NextResponse.json({ ok: true });
  }

  try {
    const reply = await runAssistantChat(admin, link.user_id, text, DEFAULT_ASSISTANT_MODEL, apiKey);
    await sendTelegramMessage(chatId, reply);
  } catch {
    await sendTelegramMessage(chatId, "Maaf, ada masalah pas mikir. Coba lagi ya.");
  }

  return NextResponse.json({ ok: true });
}
