import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashRecoveryCode } from "@/lib/mfaRecovery";
import { checkRateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const RECOVER_RATE_LIMIT = 5;
const RECOVER_RATE_WINDOW_MS = 15 * 60 * 1000;

// Deliberately NOT in proxy.ts's matcher -- this route exists precisely for
// a session stuck at aal1 (2FA enrolled, this session hasn't cleared the
// challenge), so it can't be gated behind the same aal2 check as everything
// else. Supabase requires aal2 to self-unenroll a verified TOTP factor
// ("AAL2 required to unenroll verified factor"), which is exactly the state
// a locked-out user is in -- the service-role admin client bypasses that,
// but only after a valid one-time recovery code proves this is really the
// account owner.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Belum login." }, { status: 401 });
  }

  const limit = checkRateLimit(`mfa-recover:${user.id}`, RECOVER_RATE_LIMIT, RECOVER_RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Kebanyakan percobaan, tunggu bentar ya." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "Kode recovery kosong." }, { status: 400 });
  }

  const codeHash = await hashRecoveryCode(code);
  const { data: match } = await supabase
    .from("mfa_recovery_codes")
    .select("id")
    .eq("user_id", user.id)
    .eq("code_hash", codeHash)
    .maybeSingle();

  if (!match) {
    return NextResponse.json({ error: "Kode recovery salah atau udah kepake." }, { status: 401 });
  }

  // Consumed on first use, valid or not the unenroll below succeeds -- a
  // code should never be usable twice.
  await supabase.from("mfa_recovery_codes").delete().eq("id", match.id).eq("user_id", user.id);

  const { data: factorData } = await supabase.auth.mfa.listFactors();
  const verifiedFactors = factorData?.totp?.filter((f) => f.status === "verified") ?? [];
  if (verifiedFactors.length === 0) {
    return NextResponse.json({ ok: true, result: "2FA udah nonaktif." });
  }

  const admin = createAdminClient();
  for (const factor of verifiedFactors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id });
    if (error) {
      return NextResponse.json({ error: `Gagal matiin 2FA: ${error.message}` }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, result: "2FA dimatiin. Login ulang pake password aja." });
}
