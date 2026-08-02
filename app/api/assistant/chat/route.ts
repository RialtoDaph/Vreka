import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAssistantChat } from "@/lib/assistant/run";
import { DEFAULT_ASSISTANT_MODEL, isValidAssistantModel } from "@/lib/assistant/models";

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
  const userMessage = typeof body?.message === "string" ? body.message.trim() : "";
  if (!userMessage) {
    return NextResponse.json({ error: "Pesan kosong." }, { status: 400 });
  }
  const model = isValidAssistantModel(body?.model) ? body.model : DEFAULT_ASSISTANT_MODEL;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY belum di-set di server." },
      { status: 500 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await runAssistantChat(supabase, user.id, userMessage, model, apiKey, (delta) => {
          controller.enqueue(encoder.encode(delta));
        });
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
