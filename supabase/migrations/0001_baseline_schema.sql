-- Baseline schema snapshot for Vreka.
--
-- This migration was reverse-engineered from the live Supabase project via
-- MCP introspection (list_tables, pg_policies, pg_indexes) rather than
-- written from scratch, so it matches production exactly: same tables,
-- columns, defaults, check constraints, indexes, and RLS policies.
--
-- Do NOT run this against the existing Vreka production project — every
-- table here already exists there. It exists so the schema is reproducible
-- for a fresh project (local dev, staging, disaster recovery) and so future
-- schema changes have something to diff against via numbered migrations.
--
-- Table order follows foreign-key dependencies (recurring_item_checks
-- depends on recurring_items and transactions, so it comes last).

-- ============================================================
-- transactions
-- ============================================================
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  type text not null check (type = any (array['income', 'expense'])),
  category text not null default 'Lainnya',
  amount numeric not null check (amount > 0),
  description text,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);

create index idx_transactions_user_date on public.transactions using btree (user_id, occurred_on desc);

alter table public.transactions enable row level security;

create policy transactions_owner_select on public.transactions for select using (auth.uid() = user_id);
create policy transactions_owner_insert on public.transactions for insert with check (auth.uid() = user_id);
create policy transactions_owner_update on public.transactions for update using (auth.uid() = user_id);
create policy transactions_owner_delete on public.transactions for delete using (auth.uid() = user_id);

-- ============================================================
-- debts
-- ============================================================
create table public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  party_name text not null,
  direction text not null check (direction = any (array['i_owe', 'owed_to_me'])),
  amount numeric not null check (amount > 0),
  status text not null default 'unpaid' check (status = any (array['unpaid', 'paid'])),
  due_date date,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_debts_user on public.debts using btree (user_id);

alter table public.debts enable row level security;

create policy debts_owner_select on public.debts for select using (auth.uid() = user_id);
create policy debts_owner_insert on public.debts for insert with check (auth.uid() = user_id);
create policy debts_owner_update on public.debts for update using (auth.uid() = user_id);
create policy debts_owner_delete on public.debts for delete using (auth.uid() = user_id);

-- ============================================================
-- savings_goals
-- ============================================================
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  name text not null,
  target_amount numeric not null check (target_amount > 0),
  current_amount numeric not null default 0,
  deadline date,
  created_at timestamptz not null default now()
);

create index idx_savings_user on public.savings_goals using btree (user_id);

alter table public.savings_goals enable row level security;

create policy savings_owner_select on public.savings_goals for select using (auth.uid() = user_id);
create policy savings_owner_insert on public.savings_goals for insert with check (auth.uid() = user_id);
create policy savings_owner_update on public.savings_goals for update using (auth.uid() = user_id);
create policy savings_owner_delete on public.savings_goals for delete using (auth.uid() = user_id);

-- ============================================================
-- tasks
-- ============================================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  title text not null,
  description text,
  deadline timestamptz,
  status text not null default 'todo' check (status = any (array['todo', 'done'])),
  priority text not null default 'medium' check (priority = any (array['low', 'medium', 'high'])),
  created_at timestamptz not null default now()
);

create index idx_tasks_user_deadline on public.tasks using btree (user_id, deadline);

alter table public.tasks enable row level security;

create policy tasks_owner_select on public.tasks for select using (auth.uid() = user_id);
create policy tasks_owner_insert on public.tasks for insert with check (auth.uid() = user_id);
create policy tasks_owner_update on public.tasks for update using (auth.uid() = user_id);
create policy tasks_owner_delete on public.tasks for delete using (auth.uid() = user_id);

-- ============================================================
-- study_notes
-- ============================================================
create table public.study_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  title text not null,
  content text,
  category text default 'Umum',
  progress smallint not null default 0 check (progress >= 0 and progress <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_study_user on public.study_notes using btree (user_id);

alter table public.study_notes enable row level security;

create policy study_owner_select on public.study_notes for select using (auth.uid() = user_id);
create policy study_owner_insert on public.study_notes for insert with check (auth.uid() = user_id);
create policy study_owner_update on public.study_notes for update using (auth.uid() = user_id);
create policy study_owner_delete on public.study_notes for delete using (auth.uid() = user_id);

-- ============================================================
-- assistant_messages
-- ============================================================
create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  role text not null check (role = any (array['user', 'assistant'])),
  content text not null,
  created_at timestamptz not null default now()
);

create index assistant_messages_user_created_idx on public.assistant_messages using btree (user_id, created_at);

alter table public.assistant_messages enable row level security;

-- Note: no update policy on purpose — chat history is append-only/delete-only.
create policy assistant_messages_owner_select on public.assistant_messages for select using (auth.uid() = user_id);
create policy assistant_messages_owner_insert on public.assistant_messages for insert with check (auth.uid() = user_id);
create policy assistant_messages_owner_delete on public.assistant_messages for delete using (auth.uid() = user_id);

-- ============================================================
-- assistant_memories
-- ============================================================
create table public.assistant_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  content text not null,
  created_at timestamptz not null default now()
);

create index assistant_memories_user_created_idx on public.assistant_memories using btree (user_id, created_at);

alter table public.assistant_memories enable row level security;

create policy assistant_memories_owner_select on public.assistant_memories for select using (auth.uid() = user_id);
create policy assistant_memories_owner_insert on public.assistant_memories for insert with check (auth.uid() = user_id);
create policy assistant_memories_owner_update on public.assistant_memories for update using (auth.uid() = user_id);
create policy assistant_memories_owner_delete on public.assistant_memories for delete using (auth.uid() = user_id);

-- ============================================================
-- google_credentials
-- ============================================================
create table public.google_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id),
  email_address text,
  refresh_token text not null,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_credentials enable row level security;

create policy google_credentials_owner_select on public.google_credentials for select using (auth.uid() = user_id);
create policy google_credentials_owner_insert on public.google_credentials for insert with check (auth.uid() = user_id);
create policy google_credentials_owner_update on public.google_credentials for update using (auth.uid() = user_id);
create policy google_credentials_owner_delete on public.google_credentials for delete using (auth.uid() = user_id);

-- ============================================================
-- recurring_items
-- ============================================================
create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  type text not null check (type = any (array['income', 'expense'])),
  category text not null default 'Lainnya',
  name text not null,
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

alter table public.recurring_items enable row level security;

create policy recurring_items_owner_select on public.recurring_items for select using (auth.uid() = user_id);
create policy recurring_items_owner_insert on public.recurring_items for insert with check (auth.uid() = user_id);
create policy recurring_items_owner_update on public.recurring_items for update using (auth.uid() = user_id);
create policy recurring_items_owner_delete on public.recurring_items for delete using (auth.uid() = user_id);

-- ============================================================
-- recurring_item_checks
-- ============================================================
create table public.recurring_item_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  recurring_item_id uuid not null references public.recurring_items (id),
  transaction_id uuid references public.transactions (id),
  period text not null,
  created_at timestamptz not null default now(),
  unique (recurring_item_id, period)
);

alter table public.recurring_item_checks enable row level security;

-- Note: no update policy on purpose — a period is either checked off or
-- deleted (unchecked), never edited in place.
create policy recurring_item_checks_owner_select on public.recurring_item_checks for select using (auth.uid() = user_id);
create policy recurring_item_checks_owner_insert on public.recurring_item_checks for insert with check (auth.uid() = user_id);
create policy recurring_item_checks_owner_delete on public.recurring_item_checks for delete using (auth.uid() = user_id);

-- ============================================================
-- telegram_links
-- ============================================================
create table public.telegram_links (
  user_id uuid primary key references auth.users (id),
  chat_id bigint unique,
  telegram_username text,
  link_code text unique,
  code_expires_at timestamptz,
  linked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.telegram_links enable row level security;

create policy "select own telegram link" on public.telegram_links for select using (auth.uid() = user_id);
create policy "insert own telegram link" on public.telegram_links for insert with check (auth.uid() = user_id);
create policy "update own telegram link" on public.telegram_links for update using (auth.uid() = user_id);
create policy "delete own telegram link" on public.telegram_links for delete using (auth.uid() = user_id);
