import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkBudgetAlertAndNotify } from "@/lib/budgetAlerts";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

// Called fire-and-forget right after a transaction write (TransactionsTab
// and Aslan's add_transaction tool both trigger this) -- generous limit
// since it's meant to run on every expense added, not something a user
// consciously invokes.
const CHECK_RATE_LIMIT = 60;
const CHECK_RATE_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const limit = checkRateLimit(`budget-alert-check:${user.id}`, CHECK_RATE_LIMIT, CHECK_RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json({ error: "Kebanyakan permintaan." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  if (!category) {
    return NextResponse.json({ error: "category kosong." }, { status: 400 });
  }

  await checkBudgetAlertAndNotify(supabase, user.id, category);
  return NextResponse.json({ ok: true });
}
