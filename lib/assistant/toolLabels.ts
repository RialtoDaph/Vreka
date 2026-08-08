// Shared between ActivityLog (the full history view) and AslanInbox (the
// unread-since-last-visit notification card) -- both describe the same
// assistant_audit_log rows, so the tool_name -> human label mapping only
// lives in one place.
export const TOOL_LABEL: Record<string, string> = {
  remember: "Nyimpen memory",
  forget: "Hapus memory",
  add_transaction: "Nyatetin transaksi",
  delete_transaction: "Hapus transaksi",
  add_task: "Nambah to-do",
  update_task: "Update to-do",
  delete_task: "Hapus to-do",
  add_subtask: "Nambah sub-task",
  toggle_subtask: "Update sub-task",
  add_study_note: "Nambah catatan belajar",
  update_study_note: "Update catatan belajar",
  delete_study_note: "Hapus catatan belajar",
  set_budget: "Set anggaran",
  delete_budget: "Hapus anggaran",
  toggle_habit: "Centang kebiasaan",
  search_email: "Cari email",
  read_email: "Baca email",
  draft_email_reply: "Bikin draft balesan email",
  check_calendar: "Cek kalender",
  add_calendar_event: "Bikin event kalender",
  update_calendar_event: "Update event kalender",
  delete_calendar_event: "Hapus event kalender",
  add_journal_entry: "Nambah catatan jurnal",
  search_records: "Cari data",
  add_debt: "Catat utang/piutang",
  update_debt: "Update utang/piutang",
  delete_debt: "Hapus utang/piutang",
  pay_debt: "Catat cicilan utang/piutang",
  add_savings_goal: "Bikin target tabungan",
  update_savings_goal: "Update target tabungan",
  delete_savings_goal: "Hapus target tabungan",
  add_recurring_item: "Tambah item rutin",
  delete_recurring_item: "Hapus item rutin",
  add_milestone: "Tambah milestone",
  update_milestone: "Update milestone",
  delete_milestone: "Hapus milestone",
};

// Which external integration a tool call reads/writes through, if any --
// purely cosmetic ("via google calendar"), so a tool with no obvious
// integration (e.g. "remember") just omits the tag rather than guessing.
const TOOL_SOURCE: Record<string, string> = {
  search_email: "gmail",
  read_email: "gmail",
  draft_email_reply: "gmail",
  check_calendar: "google calendar",
  add_calendar_event: "google calendar",
  update_calendar_event: "google calendar",
  delete_calendar_event: "google calendar",
};

export function toolSource(toolName: string): string | null {
  return TOOL_SOURCE[toolName] ?? null;
}

export function describeToolInput(input: Record<string, unknown>): string {
  const candidates = ["title", "title_query", "category", "content", "query", "summary"];
  for (const key of candidates) {
    const v = input[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}
