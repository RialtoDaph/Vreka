// Chart-fill variants of the brand "glow" hues (see tailwind.config.ts).
// The literal glow colors (e.g. cyan-glow #4be8ff) are neon-bright — great
// for thin text/accents on the void background, but too light and, for the
// income/expense pair specifically, too close together under red-green color
// blindness to serve as large-area chart fills. These are the same hue
// families stepped down into a mid lightness band and validated with the
// dataviz skill's palette checker (lightness band, chroma floor, CVD
// separation, contrast) against BOTH this app's dark panel surface
// (#0b1220) and its light one (#ffffff) -- same values pass both, so unlike
// the surface/text tokens in app/globals.css, these don't need separate
// per-theme variants.
export const CHART_INCOME = "#1f9bd9"; // cyan family
export const CHART_EXPENSE = "#c47a1f"; // amber family
export const CHART_AXIS = "#64748b"; // slate-500 — muted, recessive on either surface

// Grid/axis lines need to match the *current* panel border color, unlike
// the fills above -- a dark navy grid line is invisible on a white panel.
// Mirrors LIGHT_THEME.line / DARK_THEME.line in lib/theme.ts.
export const CHART_GRID_DARK = "#1c2b40";
export const CHART_GRID_LIGHT = "#dbe2ec";

// Categorical palette for multi-slice charts (expense-by-category donut).
// Fixed order, not cycled -- the dataviz skill's validated reference
// palette, checked with its validator against both panel surfaces above:
// all-adjacent CVD separation, normal-vision floor, and contrast vs surface
// all pass on both. A 6th+ category folds into the "Lainnya" (Other) bucket
// below rather than extending this list.
export const CATEGORY_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
export const CHART_OTHER = "#64748b"; // slate-500 — same muted family as CHART_AXIS, for the "Lainnya" bucket
