-- Fase 2: Kerjaan jadi papan Kanban (todo/in_progress/done) + sub-task.
alter table public.tasks drop constraint tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status = any (array['todo', 'in_progress', 'done']));

create table public.task_subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_task_subtasks_task on public.task_subtasks using btree (task_id);

alter table public.task_subtasks enable row level security;

create policy task_subtasks_owner_select on public.task_subtasks for select using (auth.uid() = user_id);
create policy task_subtasks_owner_insert on public.task_subtasks for insert with check (auth.uid() = user_id);
create policy task_subtasks_owner_update on public.task_subtasks for update using (auth.uid() = user_id);
create policy task_subtasks_owner_delete on public.task_subtasks for delete using (auth.uid() = user_id);
