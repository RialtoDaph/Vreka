import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { EXPENSE_CATEGORIES } from "@/lib/categories";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ACCEPTED_TYPES: Record<string, string> = {
  "image/jpeg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY belum di-set." }, { status: 500 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Nggak ada gambar." }, { status: 400 });
  }
  const mediaType = ACCEPTED_TYPES[file.type];
  if (!mediaType) {
    return NextResponse.json({ error: "Format gambar nggak didukung (jpg/png/webp/gif aja)." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Gambar kegedean (maks 8MB)." }, { status: 400 });
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system:
        "Kamu ekstrak data transaksi dari foto struk belanja buat aplikasi keuangan personal.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType as "image/jpeg", data: base64 },
            },
            {
              type: "text",
              text: `Ini foto struk belanja. Ekstrak: total belanja (angka aja, tanpa simbol mata uang atau pemisah ribuan), kategori pengeluaran paling cocok dari daftar ini (${EXPENSE_CATEGORIES.join(", ")}), deskripsi singkat (nama toko/tempat kalau kebaca, kosongin "" kalau nggak jelas), dan tanggal transaksi format YYYY-MM-DD kalau kelihatan di struk (kosongin "" kalau nggak kebaca). Kalau ini bukan foto struk sama sekali, set amount ke 0.`,
            },
          ],
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              amount: { type: "number" },
              category: { type: "string", enum: EXPENSE_CATEGORIES as unknown as string[] },
              description: { type: "string" },
              occurred_on: { type: "string" },
            },
            required: ["amount", "category", "description", "occurred_on"],
            additionalProperties: false,
          },
        },
      },
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      return NextResponse.json({ error: "Gagal baca struk." }, { status: 500 });
    }
    const parsed = JSON.parse(textBlock.text);
    if (!parsed.amount || Number(parsed.amount) <= 0) {
      return NextResponse.json(
        { error: "Nggak ketemu total belanja di foto ini. Isi manual aja." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      amount: Number(parsed.amount),
      category: (EXPENSE_CATEGORIES as readonly string[]).includes(parsed.category)
        ? parsed.category
        : "Lainnya",
      description: typeof parsed.description === "string" ? parsed.description : "",
      occurred_on: typeof parsed.occurred_on === "string" ? parsed.occurred_on : "",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal baca struk." },
      { status: 500 }
    );
  }
}
