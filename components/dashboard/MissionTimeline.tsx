import HudPanel from "@/components/HudPanel";
import { Task } from "@/lib/types";

const PRIORITY_CLASS: Record<Task["priority"], string> = {
  high: "text-rose-glow border-rose-glow/40",
  medium: "text-amber-glow border-amber-glow/40",
  low: "text-slate-500 border-line",
};

function formatTime(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(dateStr)
  );
}

export default function MissionTimeline({ tasks }: { tasks: Task[] }) {
  return (
    <HudPanel>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-white tracking-wide">
          Mission Timeline
        </h2>
        <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
          Hari ini
        </span>
      </div>
      {tasks.length > 0 ? (
        <ul className="space-y-2.5">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 border-b border-line/60 pb-2.5 last:border-0 last:pb-0"
            >
              <span className="text-[11px] font-mono text-cyan-glow shrink-0 w-12">
                {t.deadline ? formatTime(t.deadline) : "--:--"}
              </span>
              <span className="text-sm text-slate-200 truncate flex-1">{t.title}</span>
              <span
                className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-sm border shrink-0 ${PRIORITY_CLASS[t.priority]}`}
              >
                {t.priority}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">Nggak ada jadwal berwaktu hari ini.</p>
      )}
    </HudPanel>
  );
}
