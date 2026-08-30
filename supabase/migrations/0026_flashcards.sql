-- Flashcards for spaced-repetition review, nested under a study topic
-- (study_notes). Scheduling fields (ease_factor, interval_days,
-- repetitions, due_at) drive a lightweight SM-2 variant computed
-- client-side in lib/spacedRepetition.ts -- this table just stores
-- whatever that function last returned. last_reviewed_at is separate from
-- due_at (which jumps forward on schedule) so the streak feature has a
-- plain "was this card touched today" signal to combine with
-- study_sessions.created_at.
create table public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  note_id uuid not null references public.study_notes (id) on delete cascade,
  front text not null,
  back text not null,
  ease_factor real not null default 2.5,
  interval_days integer not null default 0,
  repetitions integer not null default 0,
  due_at timestamptz not null default now(),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_flashcards_note on public.flashcards using btree (note_id);
create index idx_flashcards_due on public.flashcards using btree (user_id, due_at);

alter table public.flashcards enable row level security;

create policy flashcards_owner_select on public.flashcards for select using (auth.uid() = user_id);
create policy flashcards_owner_insert on public.flashcards for insert with check (auth.uid() = user_id);
create policy flashcards_owner_update on public.flashcards for update using (auth.uid() = user_id);
create policy flashcards_owner_delete on public.flashcards for delete using (auth.uid() = user_id);
