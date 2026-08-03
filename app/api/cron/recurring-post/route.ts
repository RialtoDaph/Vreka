import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Jalan sekali sehari (lihat vercel.json). Buat tiap pos tetap yang
// auto_post = true dan day_of_month-nya cocok sama tanggal hari ini, catet
// transaksinya otomatis — kecuali periode ini udah ke-check (manual atau
// dari run cron sebelumnya), biar nggak dobel.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  // Explicit `!cronSecret` check so a deployment that forgot to set
  // CRON_SECRET fails closed instead of the expected value silently
  // becoming the literal string "Bearer undefined".
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit("cron:recurring-post", 5, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Rate limited." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const admin = createAdminClient();
  const today = new Date();
  const todayDay = today.getDate();
  const period = today.toISOString().slice(0, 7);
  const occurredOn = today.toISOString().slice(0, 10);

  const { data: dueItems, error: itemsError } = await admin
    .from("recurring_items")
    .select("*")
    .eq("auto_post", true)
    .eq("day_of_month", todayDay);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }
  if (!dueItems || dueItems.length === 0) {
    return NextResponse.json({ results: [] });
  }

  const results: Array<{ item_id: string; name: string; status: string }> = [];

  for (const item of dueItems) {
    // Claim this (item, period) slot *before* posting anything, by relying
    // on the DB's unique(recurring_item_id, period) constraint rather than
    // a separate "already checked?" read -- a read-then-insert here raced
    // with this same cron overlapping itself (retry, manual re-trigger) or
    // with a manual check-off in RecurringTab: both could pass the read
    // before either had inserted, producing two real transactions for the
    // same period. An insert either wins the race atomically or fails with
    // a unique-violation, so at most one transaction ever gets posted per
    // (item, period) no matter how many callers try at once.
    const { data: check, error: claimError } = await admin
      .from("recurring_item_checks")
      .insert({
        user_id: item.user_id,
        recurring_item_id: item.id,
        transaction_id: null,
        period,
      })
      .select("id")
      .single();

    if (claimError || !check) {
      const alreadyPosted = claimError?.code === "23505"; // unique_violation
      results.push({
        item_id: item.id,
        name: item.name,
        status: alreadyPosted
          ? "skip: already posted this period"
          : `error: ${claimError?.message ?? "unknown"}`,
      });
      continue;
    }

    const { data: tx, error: txError } = await admin
      .from("transactions")
      .insert({
        user_id: item.user_id,
        type: item.type,
        category: item.category,
        amount: item.amount,
        description: item.name,
        occurred_on: occurredOn,
      })
      .select("id")
      .single();

    if (txError || !tx) {
      // Release the claim so a later run can retry this period instead of
      // permanently skipping it over a transient insert failure.
      await admin.from("recurring_item_checks").delete().eq("id", check.id);
      results.push({ item_id: item.id, name: item.name, status: `error: ${txError?.message ?? "unknown"}` });
      continue;
    }

    const { error: linkError } = await admin
      .from("recurring_item_checks")
      .update({ transaction_id: tx.id })
      .eq("id", check.id);

    results.push({
      item_id: item.id,
      name: item.name,
      status: linkError ? `posted, but link failed: ${linkError.message}` : "posted",
    });
  }

  return NextResponse.json({ results });
}
