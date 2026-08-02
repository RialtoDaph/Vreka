import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Jalan sekali sehari (lihat vercel.json). Buat tiap pos tetap yang
// auto_post = true dan day_of_month-nya cocok sama tanggal hari ini, catet
// transaksinya otomatis — kecuali periode ini udah ke-check (manual atau
// dari run cron sebelumnya), biar nggak dobel.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const { data: existingChecks, error: checksError } = await admin
    .from("recurring_item_checks")
    .select("recurring_item_id")
    .eq("period", period)
    .in(
      "recurring_item_id",
      dueItems.map((i) => i.id)
    );
  if (checksError) {
    return NextResponse.json({ error: checksError.message }, { status: 500 });
  }
  const alreadyChecked = new Set((existingChecks ?? []).map((c) => c.recurring_item_id));

  const results: Array<{ item_id: string; name: string; status: string }> = [];

  for (const item of dueItems) {
    if (alreadyChecked.has(item.id)) {
      results.push({ item_id: item.id, name: item.name, status: "skip: already posted this period" });
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
      results.push({ item_id: item.id, name: item.name, status: `error: ${txError?.message}` });
      continue;
    }

    const { error: checkError } = await admin.from("recurring_item_checks").insert({
      user_id: item.user_id,
      recurring_item_id: item.id,
      transaction_id: tx.id,
      period,
    });

    results.push({
      item_id: item.id,
      name: item.name,
      status: checkError ? `error: ${checkError.message}` : "posted",
    });
  }

  return NextResponse.json({ results });
}
