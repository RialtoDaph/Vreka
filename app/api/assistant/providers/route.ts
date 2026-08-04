import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ASSISTANT_MODELS, PROVIDER_ENV_VAR, type AssistantProvider } from "@/lib/assistant/models";

export const dynamic = "force-dynamic";

// Reports which AI providers have a server-side API key configured -- never
// the key values themselves -- so the client can hide/disable model options
// it can't actually use instead of letting the user pick one and hit a 500.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const providers = Array.from(new Set(ASSISTANT_MODELS.map((m) => m.provider))) as AssistantProvider[];
  const configured = Object.fromEntries(providers.map((p) => [p, !!process.env[PROVIDER_ENV_VAR[p]]]));

  return NextResponse.json({ configured });
}
