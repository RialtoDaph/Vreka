import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const QUIZ_RATE_LIMIT = 10;
const QUIZ_RATE_WINDOW_MS = 5 * 60 * 1000;

type QuizQuestion = { question: string; options: string[]; correct_index: number };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const limit = checkRateLimit(`quiz:${user.id}`, QUIZ_RATE_LIMIT, QUIZ_RATE_WINDOW_MS);
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

  // RLS scopes this to the logged-in user — kalau note-nya bukan punya dia
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
      { error: "Catatan ini belum ada isinya, nggak bisa dibikin kuis." },
      { status: 422 }
    );
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1200,
      system:
        "Kamu bikin soal kuis pilihan ganda buat self-test belajar, dari catatan yang dikasih user. Bahasa Indonesia. Soal harus beneran nguji pemahaman isi catatan, bukan cuma nanya definisi kata.",
      messages: [
        {
          role: "user",
          content: `Topik: "${note.title}"\n\nCatatan:\n${note.content}\n\nBikin 5 soal pilihan ganda (4 opsi tiap soal, cuma 1 yang bener) buat nguji pemahaman catatan ini.`,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string" },
                    options: { type: "array", items: { type: "string" } },
                    correct_index: { type: "integer" },
                  },
                  required: ["question", "options", "correct_index"],
                  additionalProperties: false,
                },
              },
            },
            required: ["questions"],
            additionalProperties: false,
          },
        },
      },
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      return NextResponse.json({ error: "Gagal bikin kuis." }, { status: 500 });
    }
    const parsed = JSON.parse(textBlock.text) as { questions: QuizQuestion[] };
    const questions = (parsed.questions ?? []).filter(
      (q) =>
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        Number.isInteger(q.correct_index) &&
        q.correct_index >= 0 &&
        q.correct_index < q.options.length
    );

    if (questions.length === 0) {
      return NextResponse.json({ error: "Gagal bikin kuis dari catatan ini." }, { status: 500 });
    }

    return NextResponse.json({ questions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal bikin kuis." },
      { status: 500 }
    );
  }
}
