import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from "@/lib/categories";

export const dynamic = "force-dynamic";

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

  const body = await request.json().catch(() => null);
  const type = body?.type === "income" ? "income" : "expense";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  if (!description) {
    return NextResponse.json({ error: "Deskripsi kosong." }, { status: 400 });
  }

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      system: "Kamu nebak kategori transaksi keuangan dari deskripsinya.",
      messages: [
        {
          role: "user",
          content: `Deskripsi transaksi: "${description}"\nPilih SATU kategori paling cocok dari daftar ini: ${categories.join(", ")}.`,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              category: { type: "string", enum: categories as unknown as string[] },
            },
            required: ["category"],
            additionalProperties: false,
          },
        },
      },
    });

    let category = "Lainnya";
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (textBlock) {
      try {
        const parsed = JSON.parse(textBlock.text);
        if (typeof parsed.category === "string" && (categories as readonly string[]).includes(parsed.category)) {
          category = parsed.category;
        }
      } catch {
        // fall through to default
      }
    }
    return NextResponse.json({ category });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Gagal nebak kategori." },
      { status: 500 }
    );
  }
}
