import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ASSISTANT_MODEL, isValidAssistantModel } from "@/lib/assistant/models";
import { getNodeInsight, type NodeInsightInput } from "@/lib/assistant/nodeInsight";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const NODE_INSIGHT_RATE_LIMIT = 20;
const NODE_INSIGHT_RATE_WINDOW_MS = 5 * 60 * 1000;

function parseFields(value: unknown): NodeInsightInput["fields"] {
  if (!Array.isArray(value)) return [];
  const out: NodeInsightInput["fields"] = [];
  for (const item of value) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).k === "string" &&
      typeof (item as Record<string, unknown>).v === "string"
    ) {
      out.push({ k: (item as { k: string }).k, v: (item as { v: string }).v });
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const limit = checkRateLimit(`node-insight:${user.id}`, NODE_INSIGHT_RATE_LIMIT, NODE_INSIGHT_RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Kebanyakan permintaan, tunggu bentar ya." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => null);
  const label = typeof body?.label === "string" ? body.label.trim() : "";
  if (!label) {
    return NextResponse.json({ error: "label kosong." }, { status: 400 });
  }
  const typeLabel = typeof body?.typeLabel === "string" ? body.typeLabel.trim() : "";
  const fields = parseFields(body?.fields);
  const model = isValidAssistantModel(body?.model) ? body.model : DEFAULT_ASSISTANT_MODEL;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY belum di-set di server." }, { status: 500 });
  }

  try {
    const insight = await getNodeInsight(apiKey, model, { typeLabel, label, fields });
    return NextResponse.json(insight);
  } catch (err) {
    console.error("POST /api/assistant/node-insight gagal:", err);
    return NextResponse.json({ error: "Gagal ambil insight." }, { status: 500 });
  }
}
