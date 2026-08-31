alter table recurring_items
  add column if not exists account_id uuid references accounts(id) on delete set null;
