"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { createClient } from "@/lib/supabase/client";
import { Task, TaskPriority, TaskStatus, TaskSubtask } from "@/lib/types";
import { formatDateTime, daysUntil } from "@/lib/format";
import { localDateTimeValue } from "@/lib/date";
import HudPanel from "@/components/HudPanel";
import HabitsPanel from "@/components/kerjaan/HabitsPanel";
import { useConfirm } from "@/lib/useConfirm";
import { X } from "lucide-react";
import {
  inputClass,
  labelClass,
  primaryBtnClass,
  ghostBtnClass,
  dangerBtnClass,
  errorBannerClass,
} from "@/lib/ui";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  low: "text-fg-subtle border-line",
  medium: "text-amber-glow border-amber-glow/40",
  high: "text-rose-glow border-rose-glow/40",
};

// Higher first. The board used to sort purely by deadline -- the priority
// badge shown on every card never actually affected ordering, so a "high"
// item with no deadline sat wherever it happened to land instead of
// floating up.
const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

function compareTasks(a: Task, b: Task): number {
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  if (a.deadline && b.deadline) return a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0;
  if (a.deadline) return -1;
  if (b.deadline) return 1;
  return 0;
}

const COLUMNS: { key: TaskStatus; label: string; tone: string }[] = [
  { key: "todo", label: "To-do", tone: "text-fg-muted" },
  { key: "in_progress", label: "In Progress", tone: "text-amber-glow" },
  { key: "done", label: "Selesai", tone: "text-mint-glow" },
];

// Inverse of the `new Date(deadline).toISOString()` conversion done on
// save -- an <input type="datetime-local"> needs "YYYY-MM-DDTHH:mm" in the
// browser's local time, not the raw stored ISO/UTC string.
function toDatetimeLocalValue(iso: string | null): string {
  return iso ? localDateTimeValue(new Date(iso)) : "";
}

// Render-prop wrapper so useDraggable's hook call can live in its own
// component (hooks can't be called inside the .map() below) while the
// actual <li> card JSX -- which closes over a dozen bits of page
// state/handlers (expandedId, subtask editing, startEdit, handleDelete,
// ...) -- stays written inline where those closures are in scope, instead
// of having to thread all of that through as props to a separate file.
// The caller applies `setNodeRef`/`listeners`/`attributes` directly to its
// own root element (must be the <li> itself -- an extra wrapper div would
// be invalid inside a <ul>).
function DraggableCard({
  id,
  children,
}: {
  id: string;
  children: (props: {
    setNodeRef: (el: HTMLElement | null) => void;
    listeners: ReturnType<typeof useDraggable>["listeners"];
    attributes: ReturnType<typeof useDraggable>["attributes"];
    isDragging: boolean;
  }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });
  return <>{children({ setNodeRef, listeners, attributes, isDragging })}</>;
}

function DroppableColumn({
  id,
  children,
}: {
  id: TaskStatus;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-sm transition-colors -m-1 p-1 min-h-[48px] ${
        isOver ? "bg-cyan-glow/5 ring-1 ring-cyan-glow/30" : ""
      }`}
    >
      {children}
    </div>
  );
}

// Floating copy shown under the pointer while dragging -- the card being
// dragged fades out in place (see `isDragging` below) instead of moving
// itself, which reads better once a drag crosses from one column's list
// into another's.
function DragCardPreview({ task }: { task: Task }) {
  return (
    <div className="border border-cyan-glow/50 rounded-sm p-3 bg-panel2 shadow-glow w-64 cursor-grabbing">
      <p className="text-sm text-fg-secondary truncate">{task.title}</p>
      <span
        className={`inline-block mt-1.5 text-[10px] font-mono border rounded-sm px-1.5 py-0.5 ${PRIORITY_TONE[task.priority]}`}
      >
        {PRIORITY_LABEL[task.priority]}
      </span>
    </div>
  );
}

export default function KerjaanPage() {
  const supabase = createClient();
  const [items, setItems] = useState<Task[]>([]);
  const [subtasksByTask, setSubtasksByTask] = useState<Record<string, TaskSubtask[]>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [subtaskInput, setSubtaskInput] = useState("");
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [subtaskEditValue, setSubtaskEditValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [project, setProject] = useState("");
  const [projectFilter, setProjectFilter] = useState("");

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setDeadline("");
    setPriority("medium");
    setProject("");
  }

  function toggleForm() {
    resetForm();
    setShowForm((s) => !s);
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setTitle(task.title);
    setDescription(task.description ?? "");
    setDeadline(toDatetimeLocalValue(task.deadline));
    setPriority(task.priority);
    setProject(task.project ?? "");
    setShowForm(true);
  }

  async function load() {
    setLoading(true);
    const [{ data: taskRows }, { data: subtaskRows }] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .order("deadline", { ascending: true, nullsFirst: false }),
      supabase.from("task_subtasks").select("*").order("created_at", { ascending: true }),
    ]);
    setItems(taskRows ?? []);
    const grouped: Record<string, TaskSubtask[]> = {};
    for (const s of (subtaskRows ?? []) as TaskSubtask[]) {
      (grouped[s.task_id] ??= []).push(s);
    }
    setSubtasksByTask(grouped);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title) return;
    setSaving(true);
    setError(null);

    // `deadline` comes from an <input type="datetime-local">, e.g.
    // "2026-08-05T21:00" with no timezone offset. `new Date(...)` parses
    // that as local time (per spec), so converting to ISO here stores the
    // correct UTC instant instead of letting Postgres interpret the raw
    // offset-less string as UTC (which would silently shift it by the
    // browser's UTC offset).
    const payload = {
      title,
      description: description || null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      priority,
      project: project.trim() || null,
    };

    if (editingId) {
      const { error: updateError } = await supabase.from("tasks").update(payload).eq("id", editingId);
      if (updateError) {
        setError("Gagal update to-do. Coba lagi.");
        setSaving(false);
        return;
      }
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Sesi login habis. Refresh halaman terus coba lagi.");
        setSaving(false);
        return;
      }
      const { error: insertError } = await supabase
        .from("tasks")
        .insert({ user_id: user.id, ...payload, status: "todo" });
      if (insertError) {
        setError("Gagal simpan to-do. Coba lagi.");
        setSaving(false);
        return;
      }
    }

    resetForm();
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function updateStatus(task: Task, status: TaskStatus) {
    setError(null);
    const previous = items;
    setItems((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    const { error: updateError } = await supabase.from("tasks").update({ status }).eq("id", task.id);
    if (updateError) {
      setItems(previous);
      setError("Gagal update status. Coba lagi.");
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over) return;
    const task = items.find((t) => t.id === active.id);
    const nextStatus = over.id as TaskStatus;
    if (!task || task.status === nextStatus) return;
    updateStatus(task, nextStatus);
  }

  async function handleDelete(id: string) {
    if (!(await confirm("Yakin mau hapus to-do ini? Sub-task-nya ikut kehapus."))) return;
    setError(null);
    const previousItems = items;
    const previousSubtasks = subtasksByTask;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSubtasksByTask((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (id === editingId) {
      resetForm();
      setShowForm(false);
    }
    const { error: deleteError } = await supabase.from("tasks").delete().eq("id", id);
    if (deleteError) {
      setItems(previousItems);
      setSubtasksByTask(previousSubtasks);
      setError("Gagal hapus to-do. Coba lagi.");
    }
  }

  async function handleAddSubtask(taskId: string) {
    const subtaskTitle = subtaskInput.trim();
    if (!subtaskTitle) return;
    setSubtaskInput("");
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesi login habis. Refresh halaman terus coba lagi.");
      return;
    }
    const { data, error: insertError } = await supabase
      .from("task_subtasks")
      .insert({ user_id: user.id, task_id: taskId, title: subtaskTitle })
      .select("*")
      .single();
    if (insertError || !data) {
      setError("Gagal tambah sub-task. Coba lagi.");
      return;
    }
    setSubtasksByTask((prev) => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), data] }));
  }

  async function toggleSubtask(subtask: TaskSubtask) {
    setError(null);
    const previous = subtasksByTask;
    const done = !subtask.done;
    setSubtasksByTask((prev) => ({
      ...prev,
      [subtask.task_id]: (prev[subtask.task_id] ?? []).map((s) =>
        s.id === subtask.id ? { ...s, done } : s
      ),
    }));
    const { error: updateError } = await supabase
      .from("task_subtasks")
      .update({ done })
      .eq("id", subtask.id);
    if (updateError) {
      setSubtasksByTask(previous);
      setError("Gagal update sub-task. Coba lagi.");
    }
  }

  function startEditSubtask(subtask: TaskSubtask) {
    setEditingSubtaskId(subtask.id);
    setSubtaskEditValue(subtask.title);
  }

  async function saveSubtaskEdit(subtask: TaskSubtask) {
    const newTitle = subtaskEditValue.trim();
    setEditingSubtaskId(null);
    if (!newTitle || newTitle === subtask.title) return;
    setError(null);
    const previous = subtasksByTask;
    setSubtasksByTask((prev) => ({
      ...prev,
      [subtask.task_id]: (prev[subtask.task_id] ?? []).map((s) =>
        s.id === subtask.id ? { ...s, title: newTitle } : s
      ),
    }));
    const { error: updateError } = await supabase
      .from("task_subtasks")
      .update({ title: newTitle })
      .eq("id", subtask.id);
    if (updateError) {
      setSubtasksByTask(previous);
      setError("Gagal update sub-task. Coba lagi.");
    }
  }

  async function deleteSubtask(subtask: TaskSubtask) {
    setError(null);
    const previous = subtasksByTask;
    setSubtasksByTask((prev) => ({
      ...prev,
      [subtask.task_id]: (prev[subtask.task_id] ?? []).filter((s) => s.id !== subtask.id),
    }));
    const { error: deleteError } = await supabase.from("task_subtasks").delete().eq("id", subtask.id);
    if (deleteError) {
      setSubtasksByTask(previous);
      setError("Gagal hapus sub-task. Coba lagi.");
    }
  }

  const projects = Array.from(new Set(items.map((t) => t.project).filter((p): p is string => !!p))).sort();

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-[0.3em] text-cyan-glow mb-1">
            Modul 02
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-fg">
            Kerjaan
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/canvas" className={ghostBtnClass}>
            ⌗ Canvas
          </Link>
          <button onClick={toggleForm} className={primaryBtnClass}>
            {showForm ? "Batal" : "+ To-do Baru"}
          </button>
        </div>
      </header>

      {error && <p className={errorBannerClass}>{error}</p>}

      {showForm && (
        <HudPanel>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="task-title" className={labelClass}>
                Judul
              </label>
              <input
                id="task-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
                placeholder="Kirim laporan mingguan"
              />
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="task-deadline" className={labelClass}>
                  Deadline (opsional)
                </label>
                <input
                  id="task-deadline"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="task-priority" className={labelClass}>
                  Prioritas
                </label>
                <select
                  id="task-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className={inputClass}
                >
                  <option value="low">Rendah</option>
                  <option value="medium">Sedang</option>
                  <option value="high">Tinggi</option>
                </select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="task-description" className={labelClass}>
                  Catatan (opsional)
                </label>
                <input
                  id="task-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="task-project" className={labelClass}>
                  Project (opsional)
                </label>
                <input
                  id="task-project"
                  type="text"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  className={inputClass}
                  placeholder="Relokasi, Sertifikasi, dll"
                />
              </div>
            </div>
            <button type="submit" disabled={saving} className={primaryBtnClass}>
              {saving ? "Menyimpan..." : editingId ? "Update To-do" : "Simpan"}
            </button>
          </form>
        </HudPanel>
      )}

      {!loading && projects.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="task-project-filter" className="text-[11px] font-mono uppercase tracking-wider text-fg-subtle">
            Project
          </label>
          <select
            id="task-project-filter"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className={`${inputClass} w-auto`}
          >
            <option value="">Semua</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <HudPanel>
          <p className="text-sm text-fg-subtle">Memuat...</p>
        </HudPanel>
      ) : (
        <DndContext sensors={dndSensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid md:grid-cols-3 gap-4 items-start">
            {COLUMNS.map((col) => {
              const colItems = items
                .filter((t) => t.status === col.key && (!projectFilter || t.project === projectFilter))
                .sort(compareTasks);
              return (
                <HudPanel key={col.key}>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className={`font-display font-semibold tracking-wide ${col.tone}`}>
                      {col.label}
                    </h2>
                    <span className="text-xs font-mono text-fg-subtle">{colItems.length}</span>
                  </div>

                  <DroppableColumn id={col.key}>
                    {colItems.length === 0 ? (
                      <p className="text-sm text-fg-subtle">Kosong.</p>
                    ) : (
                      <ul className="space-y-3">
                        {colItems.map((task) => {
                          const d = daysUntil(task.deadline);
                          const urgent = d !== null && d <= 2 && task.status !== "done";
                          const subtasks = subtasksByTask[task.id] ?? [];
                          const doneSubtasks = subtasks.filter((s) => s.done).length;
                          const allSubtasksDone = subtasks.length > 0 && doneSubtasks === subtasks.length && task.status !== "done";
                          const expanded = expandedId === task.id;
                          return (
                            <DraggableCard key={task.id} id={task.id}>
                              {({ setNodeRef, listeners, attributes, isDragging }) => (
                                <li
                                  ref={setNodeRef}
                                  {...listeners}
                                  {...attributes}
                                  className={`border border-line rounded-sm p-3 bg-panel2/50 cursor-grab active:cursor-grabbing ${
                                    isDragging ? "opacity-30" : ""
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <p
                                      className={`text-sm truncate ${
                                        task.status === "done"
                                          ? "text-fg-subtle line-through"
                                          : "text-fg-secondary"
                                      }`}
                                    >
                                      {task.title}
                                    </p>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        onClick={() => startEdit(task)}
                                        aria-label={`Edit to-do ${task.title}`}
                                        className="text-fg-subtle hover:text-cyan-glow text-xs font-mono leading-none"
                                      >
                                        Edit
                                      </button>
                                      <button onClick={() => handleDelete(task.id)} className={dangerBtnClass}>
                                        Hapus
                                      </button>
                                    </div>
                                  </div>
                                  {task.description && (
                                    <p className="text-xs text-fg-subtle truncate mt-0.5">{task.description}</p>
                                  )}
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <span
                                      className={`text-[10px] font-mono border rounded-sm px-1.5 py-0.5 ${PRIORITY_TONE[task.priority]}`}
                                    >
                                      {PRIORITY_LABEL[task.priority]}
                                    </span>
                                    {task.project && (
                                      <span className="text-[10px] font-mono border border-cyan-glow/30 text-cyan-glow/80 rounded-sm px-1.5 py-0.5">
                                        {task.project}
                                      </span>
                                    )}
                                    {task.deadline && (
                                      <span
                                        className={`text-[10px] font-mono ${urgent ? "text-rose-glow" : "text-fg-subtle"}`}
                                      >
                                        {formatDateTime(task.deadline)}
                                      </span>
                                    )}
                                    {subtasks.length > 0 && (
                                      <button
                                        onClick={() => setExpandedId(expanded ? null : task.id)}
                                        title={
                                          allSubtasksDone
                                            ? "Semua sub-task selesai -- tandain to-do ini selesai juga?"
                                            : undefined
                                        }
                                        className={`text-[10px] font-mono ${
                                          allSubtasksDone
                                            ? "text-mint-glow hover:text-mint-glow/80"
                                            : "text-cyan-glow/80 hover:text-cyan-glow"
                                        }`}
                                      >
                                        {allSubtasksDone && "✓ "}
                                        {doneSubtasks}/{subtasks.length} sub-task {expanded ? "▾" : "▸"}
                                      </button>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 mt-2">
                                    {col.key === "todo" && (
                                      <button
                                        onClick={() => updateStatus(task, "in_progress")}
                                        className={ghostBtnClass}
                                      >
                                        → Mulai
                                      </button>
                                    )}
                                    {col.key === "in_progress" && (
                                      <>
                                        <button
                                          onClick={() => updateStatus(task, "todo")}
                                          className={ghostBtnClass}
                                        >
                                          ← To-do
                                        </button>
                                        <button
                                          onClick={() => updateStatus(task, "done")}
                                          className={ghostBtnClass}
                                        >
                                          ✓ Selesai
                                        </button>
                                      </>
                                    )}
                                    {col.key === "done" && (
                                      <button
                                        onClick={() => updateStatus(task, "todo")}
                                        className={ghostBtnClass}
                                      >
                                        ↺ Buka lagi
                                      </button>
                                    )}
                                    {subtasks.length === 0 && (
                                      <button
                                        onClick={() => setExpandedId(expanded ? null : task.id)}
                                        className="text-[11px] font-mono text-fg-subtle hover:text-fg-muted"
                                      >
                                        + Sub-task
                                      </button>
                                    )}
                                  </div>

                                  {expanded && (
                                    <div className="mt-3 pt-3 border-t border-line/60 space-y-2">
                                      {subtasks.map((s) =>
                                        editingSubtaskId === s.id ? (
                                          <div key={s.id} className="flex items-center gap-2">
                                            <input
                                              type="text"
                                              autoFocus
                                              value={subtaskEditValue}
                                              onChange={(e) => setSubtaskEditValue(e.target.value)}
                                              onBlur={() => saveSubtaskEdit(s)}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  saveSubtaskEdit(s);
                                                } else if (e.key === "Escape") {
                                                  setEditingSubtaskId(null);
                                                }
                                              }}
                                              className={`${inputClass} text-xs py-1 flex-1`}
                                            />
                                          </div>
                                        ) : (
                                          <div key={s.id} className="flex items-center gap-2">
                                            <input
                                              type="checkbox"
                                              checked={s.done}
                                              onChange={() => toggleSubtask(s)}
                                              className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-cyan-glow"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => startEditSubtask(s)}
                                              title="Klik buat ganti judul"
                                              className={`text-xs flex-1 truncate text-left bg-transparent border-none p-0 cursor-text ${
                                                s.done ? "text-fg-subtle line-through" : "text-fg-muted"
                                              }`}
                                            >
                                              {s.title}
                                            </button>
                                            <button
                                              onClick={() => deleteSubtask(s)}
                                              aria-label={`Hapus sub-task ${s.title}`}
                                              className="text-rose-glow/70 hover:text-rose-glow"
                                            >
                                              <X aria-hidden="true" className="w-3 h-3" strokeWidth={2} />
                                            </button>
                                          </div>
                                        )
                                      )}
                                      <div className="flex gap-2">
                                        <input
                                          type="text"
                                          value={subtaskInput}
                                          onChange={(e) => setSubtaskInput(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              e.preventDefault();
                                              handleAddSubtask(task.id);
                                            }
                                          }}
                                          placeholder="Sub-task baru..."
                                          className={`${inputClass} text-xs py-1.5`}
                                        />
                                        <button
                                          onClick={() => handleAddSubtask(task.id)}
                                          className={ghostBtnClass}
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </li>
                              )}
                            </DraggableCard>
                          );
                        })}
                      </ul>
                    )}
                  </DroppableColumn>
                </HudPanel>
              );
            })}
          </div>
          <DragOverlay>
            {activeDragId
              ? (() => {
                  const dragged = items.find((t) => t.id === activeDragId);
                  return dragged ? <DragCardPreview task={dragged} /> : null;
                })()
              : null}
          </DragOverlay>
        </DndContext>
      )}

      <HabitsPanel />

      {confirmDialog}
    </div>
  );
}
