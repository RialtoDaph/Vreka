import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ASSISTANT_MODEL, isValidAssistantModel } from "@/lib/assistant/models";
import { getMarketResearch } from "@/lib/assistant/marketResearch";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const MARKET_RESEARCH_RATE_LIMIT = 10;
const MARKET_RESEARCH_RATE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const limit = checkRateLimit(`market-research:${user.id}`, MARKET_RESEARCH_RATE_LIMIT, MARKET_RESEARCH_RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Kebanyakan permintaan, tunggu bentar ya." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => null);
  const model = isValidAssistantModel(body?.model) ? body.model : DEFAULT_ASSISTANT_MODEL;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY belum di-set di server." }, { status: 500 });
  }

  try {
    const research = await getMarketResearch(apiKey, model);
    return NextResponse.json(research);
  } catch (err) {
    console.error("POST /api/assistant/market-research gagal:", err);
    return NextResponse.json({ error: "Gagal ambil riset pasar." }, { status: 500 });
  }
}
