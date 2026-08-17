// Every table that's owned per-user (RLS-scoped to user_id) and part of a
// full data export/import round-trip (components/asisten/DataExport.tsx,
// components/asisten/DataImport.tsx). Order doesn't matter for export --
// each table is an independent SELECT -- but import re-inserts in this
// exact order, and it's arranged so every foreign key between these tables
// only ever points at one listed earlier (accounts before transactions,
// tasks before task_subtasks, etc.), so parent rows always exist before a
// child tries to reference them.
export const EXPORTABLE_TABLES = [
  "accounts",
  "recurring_items",
  "debts",
  "savings_goals",
  "budgets",
  "tasks",
  "study_notes",
  "habits",
  "journal_entries",
  "life_milestones",
  "canvas_nodes",
  "daily_briefings",
  "assistant_memories",
  "assistant_messages",
  "assistant_audit_log",
  "transactions",
  "task_subtasks",
  "habit_checks",
  "study_sessions",
  "study_resources",
  "flashcards",
  "canvas_arrows",
  "debt_payments",
  "debt_payment_checks",
  "recurring_item_checks",
] as const;

export type ExportableTable = (typeof EXPORTABLE_TABLES)[number];
