import HudPanel from "./HudPanel";

export default function StatCard({
  label,
  value,
  hint,
  tone = "cyan",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "cyan" | "amber" | "rose" | "mint";
}) {
  const toneClass = {
    cyan: "text-cyan-glow",
    amber: "text-amber-glow",
    rose: "text-rose-glow",
    mint: "text-mint-glow",
  }[tone];

  return (
    <HudPanel>
      <p className="text-[11px] font-mono uppercase tracking-widest text-slate-500 mb-2">
        {label}
      </p>
      <p className={`font-mono text-2xl sm:text-3xl font-bold ${toneClass}`}>
        {value}
      </p>
      {hint && <p className="text-xs text-slate-500 mt-1.5">{hint}</p>}
    </HudPanel>
  );
}
