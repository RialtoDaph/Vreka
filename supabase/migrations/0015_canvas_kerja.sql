-- Canvas Kerja: freeform whiteboard (sticky notes + task cards + arrows
-- between them) living alongside the Kerjaan Kanban board, not replacing
-- it. Nodes are purely freeform -- a "task card" node's text/label are
-- just strings the user typed, not a foreign key into `tasks`, matching
-- the design handoff's own scope (a scratchpad, not a second view onto
-- the real Kanban data).
create table public.canvas_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  kind text not null check (kind in ('sticky', 'task')),
  x numeric not null default 0,
  y numeric not null default 0,
  w numeric not null default 200,
  h numeric not null default 150,
  text text not null default '',
  color text,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_canvas_nodes_user on public.canvas_nodes using btree (user_id);

alter table public.canvas_nodes enable row level security;

create policy canvas_nodes_owner_select on public.canvas_nodes for select using (auth.uid() = user_id);
create policy canvas_nodes_owner_insert on public.canvas_nodes for insert with check (auth.uid() = user_id);
create policy canvas_nodes_owner_update on public.canvas_nodes for update using (auth.uid() = user_id);
create policy canvas_nodes_owner_delete on public.canvas_nodes for delete using (auth.uid() = user_id);

create table public.canvas_arrows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  from_node_id uuid not null references public.canvas_nodes (id) on delete cascade,
  to_node_id uuid not null references public.canvas_nodes (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index idx_canvas_arrows_user on public.canvas_arrows using btree (user_id);

alter table public.canvas_arrows enable row level security;

create policy canvas_arrows_owner_select on public.canvas_arrows for select using (auth.uid() = user_id);
create policy canvas_arrows_owner_insert on public.canvas_arrows for insert with check (auth.uid() = user_id);
create policy canvas_arrows_owner_delete on public.canvas_arrows for delete using (auth.uid() = user_id);
