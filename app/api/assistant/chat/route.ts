import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAssistantChat } from "@/lib/assistant/run";
import { DEFAULT_ASSISTANT_MODEL, isValidAssistantModel, providerForModel, PROVIDER_ENV_VAR } from "@/lib/assistant/models";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const CHAT_RATE_LIMIT = 30;
const CHAT_RATE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const limit = checkRateLimit(`chat:${user.id}`, CHAT_RATE_LIMIT, CHAT_RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Kebanyakan pesan, tunggu bentar ya." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => null);
  const userMessage = typeof body?.message === "string" ? body.message.trim() : "";
  if (!userMessage) {
    return NextResponse.json({ error: "Pesan kosong." }, { status: 400 });
  }
  const requestedModel = isValidAssistantModel(body?.model) ? body.model : DEFAULT_ASSISTANT_MODEL;
  // A screen-share snapshot only ever goes through Claude vision -- if the
  // user's currently-selected chat model is a non-Anthropic one, force the
  // default Claude model for this turn instead of sending the image
  // somewhere that can't read it.
  const image = typeof body?.image === "string" && body.image.startsWith("data:image/") ? body.image : undefined;
  const model = image && providerForModel(requestedModel) !== "anthropic" ? DEFAULT_ASSISTANT_MODEL : requestedModel;

  const provider = providerForModel(model);
  const envVar = PROVIDER_ENV_VAR[provider];
  const apiKey = process.env[envVar];
  if (!apiKey) {
    return NextResponse.json({ error: `${envVar} belum di-set di server.` }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await runAssistantChat(
          supabase,
          user.id,
          userMessage,
          model,
          apiKey,
          (delta) => {
            controller.enqueue(encoder.encode(delta));
          },
          image
        );
      } catch (err) {
        // runAssistantChat already catches errors from inside its own tool
        // loop and streams a friendly fallback through onDelta -- this only
        // fires for something that throws outside that (e.g. the initial
        // history/system-prompt fetch), so it's rare, but silently eating
        // it here would erase the only server-side trace of why a reply
        // never showed up.
        console.error("POST /api/assistant/chat gagal:", err);
        controller.enqueue(encoder.encode("Maaf, ada masalah pas mikir. Coba lagi ya."));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
