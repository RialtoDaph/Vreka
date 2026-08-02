-- Fase 3: audit log buat transparansi aksi Aslan — tiap tool call (bukan
-- cuma yang destruktif) dicatet, biar user bisa liat "apa aja yang Aslan
-- ubah atas nama saya". Append-only dengan sengaja: cuma select + insert,
-- nggak ada update/delete policy, jadi log-nya nggak bisa diutak-atik lagi
-- setelah tercatat.
create table public.assistant_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  tool_name text not null,
  input jsonb not null,
  result_ok boolean not null,
  result_summary text,
  created_at timestamptz not null default now()
);

create index idx_assistant_audit_log_user_created on public.assistant_audit_log using btree (user_id, created_at desc);

alter table public.assistant_audit_log enable row level security;

create policy assistant_audit_log_owner_select on public.assistant_audit_log for select using (auth.uid() = user_id);
create policy assistant_audit_log_owner_insert on public.assistant_audit_log for insert with check (auth.uid() = user_id);
