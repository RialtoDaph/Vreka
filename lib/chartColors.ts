// Chart-fill variants of the brand "glow" hues (see tailwind.config.ts).
// The literal glow colors (e.g. cyan-glow #4be8ff) are neon-bright — great
// for thin text/accents on the void background, but too light and, for the
// income/expense pair specifically, too close together under red-green color
// blindness to serve as large-area chart fills. These are the same hue
// families stepped down into a dark-surface-safe lightness band and
// validated with the dataviz skill's palette checker (lightness band,
// chroma floor, CVD separation, contrast vs #0b1220) before use.
export const CHART_INCOME = "#1f9bd9"; // cyan family
export const CHART_EXPENSE = "#c47a1f"; // amber family
export const CHART_AXIS = "#64748b"; // slate-500 — muted, recessive
export const CHART_GRID = "#1c2b40"; // matches --line border color

// Categorical palette for multi-slice charts (expense-by-category donut).
// Fixed order, not cycled -- the dataviz skill's validated reference
// palette (dark-mode steps), checked with its validator against this app's
// actual panel surface (#0b1220): all-adjacent CVD separation, normal-vision
// floor, and contrast vs surface all pass. A 6th+ category folds into the
// "Lainnya" (Other) bucket below rather than extending this list.
export const CATEGORY_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
export const CHART_OTHER = "#64748b"; // slate-500 — same muted family as CHART_AXIS, for the "Lainnya" bucket
