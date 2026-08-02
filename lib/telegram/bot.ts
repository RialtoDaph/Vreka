function requireBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN belum di-set di server.");
  return token;
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${requireBotToken()}/${method}`;
}

export async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const res = await fetch(apiUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  // Deliberately doesn't throw -- callers (webhook route especially) treat
  // this as fire-and-forget across several call sites that aren't all
  // wrapped in their own try/catch. But a failed send used to be
  // completely invisible (no res.ok check at all), so at least log it.
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Telegram sendMessage gagal (chat ${chatId}, status ${res.status}): ${body}`);
  }
}

export async function setTelegramWebhook(url: string, secretToken: string): Promise<void> {
  const res = await fetch(apiUrl("setWebhook"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, secret_token: secretToken, allowed_updates: ["message"] }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`Gagal setWebhook: ${data.description ?? res.statusText}`);
  }
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { username?: string };
    text?: string;
  };
}
