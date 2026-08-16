import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FLASHCARDS_RATE_LIMIT = 10;
const FLASHCARDS_RATE_WINDOW_MS = 5 * 60 * 1000;

type FlashcardDraft = { front: string; back: string };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const limit = checkRateLimit(`flashcards:${user.id}`, FLASHCARDS_RATE_LIMIT, FLASHCARDS_RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Kebanyakan permintaan, tunggu bentar ya." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY belum di-set." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const noteId = typeof body?.noteId === "string" ? body.noteId : "";
  if (!noteId) {
    return NextResponse.json({ error: "noteId kosong." }, { status: 400 });
  }

  // RLS scopes this to the logged-in user -- kalau note-nya bukan punya dia
  // (atau nggak ada), query ini balikin kosong, bukan bocorin punya orang lain.
  const { data: note, error } = await supabase
    .from("study_notes")
    .select("title, content")
    .eq("id", noteId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!note) {
    return NextResponse.json({ error: "Catatan nggak ketemu." }, { status: 404 });
  }
  if (!note.content || !note.content.trim()) {
    return NextResponse.json(
      { error: "Catatan ini belum ada isinya, nggak bisa dibikin kartu." },
      { status: 422 }
    );
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1200,
      system:
        "Kamu bikin flashcard (kartu depan/belakang) buat spaced repetition dari catatan belajar user. Depan singkat (istilah, kata, atau pertanyaan), belakang jawabannya (definisi, terjemahan, atau penjelasan singkat). Bahasa Indonesia, kecuali kalau materinya emang bahasa asing (misal vocab bahasa Inggris) -- di situ kata aslinya tetep dipertahanin di depan kartu.",
      messages: [
        {
          role: "user",
          content: `Topik: "${note.title}"\n\nCatatan:\n${note.content}\n\nBikin 8 flashcard dari catatan ini.`,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              cards: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    front: { type: "string" },
                    back: { type: "string" },
                  },
                  required: ["front", "back"],
                  additionalProperties: false,
                },
              },
            },
            required: ["cards"],
            additionalProperties: false,
          },
        },
      },
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      return NextResponse.json({ error: "Gagal bikin kartu." }, { status: 500 });
    }
    const parsed = JSON.parse(textBlock.text) as { cards: FlashcardDraft[] };
    const cards = (parsed.cards ?? []).filter(
      (c) => typeof c.front === "string" && c.front.trim() && typeof c.back === "string" && c.back.trim()
    );

    if (cards.length === 0) {
      return NextResponse.json({ error: "Gagal bikin kartu dari catatan ini." }, { status: 500 });
    }

    return NextResponse.json({ cards });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal bikin kartu." },
      { status: 500 }
    );
  }
}
