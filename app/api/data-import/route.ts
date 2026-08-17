import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { EXPORTABLE_TABLES } from "@/lib/exportableTables";

export const dynamic = "force-dynamic";

// Keeps request/response bodies bounded for a user with years of
// assistant_audit_log or transaction history.
const BATCH_SIZE = 500;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const importData = body?.data;
  if (!importData || typeof importData !== "object") {
    return NextResponse.json({ error: "File export nggak valid." }, { status: 400 });
  }

  const results: Record<string, { imported: number; error?: string }> = {};

  // EXPORTABLE_TABLES is ordered parent-before-child, so a table's foreign
  // keys always point at rows already inserted earlier in this loop.
  for (const table of EXPORTABLE_TABLES) {
    const rows = Array.isArray(importData[table]) ? (importData[table] as Record<string, unknown>[]) : [];
    if (rows.length === 0) {
      results[table] = { imported: 0 };
      continue;
    }

    // Every row's ownership is forced to the logged-in user regardless of
    // what's in the file -- both a safety guard against claiming someone
    // else's exported data, and required for RLS's insert policy
    // (`user_id = auth.uid()`) to accept the row at all.
    const owned = rows.map((row) => ({ ...row, user_id: user.id }));

    let imported = 0;
    let tableError: string | undefined;
    for (let i = 0; i < owned.length; i += BATCH_SIZE) {
      const batch = owned.slice(i, i + BATCH_SIZE);
      // Upsert on id -- re-running an import (or restoring on top of data
      // that's already partially there) overwrites matching rows instead
      // of failing on a duplicate-key conflict.
      const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
      if (error) {
        tableError = error.message;
        break;
      }
      imported += batch.length;
    }
    results[table] = tableError ? { imported, error: tableError } : { imported };
  }

  return NextResponse.json({ results });
}
