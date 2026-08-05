-- One-time recovery codes for 2FA lockout. Supabase requires an aal2
-- session to unenroll a *verified* TOTP factor ("AAL2 required to unenroll
-- verified factor") -- a user stuck at aal1 because they lost their
-- authenticator has no self-service way to remove it. A valid recovery
-- code lets app/api/mfa/recover/route.ts use the service-role client
-- (auth.admin.mfa.deleteFactor, which isn't subject to that aal2 gate) to
-- remove the factor on the user's behalf, dropping them back to
-- password-only login so they can re-enroll a new authenticator.
--
-- Codes are stored hashed (SHA-256 is fine here -- these are
-- high-entropy random strings, not user-chosen passwords, so there's no
-- need for a slow KDF) and consumed (deleted) on first use.
create table public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  code_hash text not null,
  created_at timestamptz not null default now()
);

create index idx_mfa_recovery_codes_user on public.mfa_recovery_codes using btree (user_id);

alter table public.mfa_recovery_codes enable row level security;

create policy mfa_recovery_codes_owner_select on public.mfa_recovery_codes for select using (auth.uid() = user_id);
create policy mfa_recovery_codes_owner_insert on public.mfa_recovery_codes for insert with check (auth.uid() = user_id);
create policy mfa_recovery_codes_owner_delete on public.mfa_recovery_codes for delete using (auth.uid() = user_id);
