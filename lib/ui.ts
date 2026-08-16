export const inputClass =
  "w-full bg-panel2 border border-line rounded-sm px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-cyan-glow/60 transition-colors";

export const labelClass =
  "block text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-1.5";

export const primaryBtnClass =
  "bg-cyan-glow/10 hover:bg-cyan-glow/20 border border-cyan-glow/50 text-cyan-glow font-mono uppercase tracking-wider text-xs py-2.5 px-4 rounded-sm transition-colors disabled:opacity-50";

export const ghostBtnClass =
  "border border-line text-slate-400 hover:text-slate-200 hover:border-slate-500 font-mono uppercase tracking-wider text-xs py-2.5 px-4 rounded-sm transition-colors";

// Same shape as primaryBtnClass, rose-toned -- the confirming action in a
// destructive ConfirmDialog (delete, discard, etc).
export const dangerPrimaryBtnClass =
  "bg-rose-glow/10 hover:bg-rose-glow/20 border border-rose-glow/50 text-rose-glow font-mono uppercase tracking-wider text-xs py-2.5 px-4 rounded-sm transition-colors disabled:opacity-50";

// py-2/-my-2 enlarges the tap target on touch devices without shifting the
// text's visible position or affecting the row's line height.
export const dangerBtnClass =
  "text-rose-glow/70 hover:text-rose-glow text-xs font-mono transition-colors py-2 -my-2";

export const errorBannerClass =
  "text-xs text-rose-glow bg-rose-glow/10 border border-rose-glow/30 rounded-sm px-3 py-2";
