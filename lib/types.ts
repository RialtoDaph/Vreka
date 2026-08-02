export type TransactionType = "income" | "expense";

export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  category: string;
  amount: number;
  description: string | null;
  occurred_on: string;
  created_at: string;
  receipt_path: string | null;
};

export type RecurringItem = {
  id: string;
  user_id: string;
  type: TransactionType;
  category: string;
  name: string;
  amount: number;
  created_at: string;
  auto_post: boolean;
  day_of_month: number | null;
};

export type RecurringItemCheck = {
  id: string;
  user_id: string;
  recurring_item_id: string;
  transaction_id: string | null;
  period: string;
  created_at: string;
};

export type DebtDirection = "i_owe" | "owed_to_me";
export type DebtStatus = "unpaid" | "paid";

export type Debt = {
  id: string;
  user_id: string;
  party_name: string;
  direction: DebtDirection;
  amount: number;
  status: DebtStatus;
  due_date: string | null;
  notes: string | null;
  created_at: string;
};

export type SavingsGoal = {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  created_at: string;
};

export type Budget = {
  id: string;
  user_id: string;
  category: string;
  monthly_limit: number;
  created_at: string;
};

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export type Task = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
  project: string | null;
};

export type TaskSubtask = {
  id: string;
  user_id: string;
  task_id: string;
  title: string;
  done: boolean;
  created_at: string;
};

export type Habit = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};

export type HabitCheck = {
  id: string;
  user_id: string;
  habit_id: string;
  period: string;
  created_at: string;
};

export type StudyNote = {
  id: string;
  user_id: string;
  title: string;
  content: string | null;
  category: string;
  progress: number;
  created_at: string;
  updated_at: string;
};

export type StudySession = {
  id: string;
  user_id: string;
  note_id: string;
  minutes: number;
  created_at: string;
};

export type StudyResource = {
  id: string;
  user_id: string;
  note_id: string;
  label: string;
  url: string;
  created_at: string;
};

export type JournalEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type AssistantRole = "user" | "assistant";

export type AssistantMessage = {
  id: string;
  user_id: string;
  role: AssistantRole;
  content: string;
  created_at: string;
};

export type AssistantAuditLog = {
  id: string;
  user_id: string;
  tool_name: string;
  input: Record<string, unknown>;
  result_ok: boolean;
  result_summary: string | null;
  created_at: string;
};
