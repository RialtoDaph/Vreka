"use client";

// One button in the small icon toolbar (screen share / tools / hands-free /
// voice) -- icon-only with an aria-label since there's no room for text
// labels at this size. Lives on the Memory Map, bottom-center.
export default function ToolbarIconButton({
  icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-10 h-10 rounded-full border flex items-center justify-center text-base transition-colors shrink-0 ${
        active
          ? "border-cyan-glow bg-cyan-glow/10 text-cyan-glow shadow-glow"
          : disabled
            ? "border-line/50 text-slate-700 cursor-not-allowed"
            : "border-line text-slate-400 hover:text-slate-200 hover:border-cyan-glow/40"
      }`}
    >
      {icon}
    </button>
  );
}
