// Bridge Design Token Constants
// Mirrors all CSS custom property values from bridge.css
// Use these in JS/TS when you need token values programmatically.

// ── Surface Stack (backgrounds) ───────────────────────────────
export const abyss = "oklch(0.14 0.015 250)";
export const deep = "oklch(0.17 0.018 250)";
export const mid = "oklch(0.21 0.020 250)";
export const surface = "oklch(0.26 0.022 250)";
export const panel = "oklch(0.16 0.016 250)";

// ── Accent Glow Trio ──────────────────────────────────────────
export const glow = "oklch(0.82 0.15 195)";
export const glowDim = "oklch(0.82 0.05 195)";
export const glowStrong = "oklch(0.82 0.22 195)";

// ── Text Colors ───────────────────────────────────────────────
export const foam = "oklch(0.98 0.005 250)";
export const muted = "oklch(0.72 0.010 250)";
export const dim = "oklch(0.50 0.012 250)";
export const faint = "oklch(0.35 0.010 250)";

// ── Semantic Colors ───────────────────────────────────────────
export const seaGreen = "oklch(0.78 0.16 155)";
export const brass = "oklch(0.85 0.18 75)";
export const alertRed = "oklch(0.65 0.22 25)";
export const cargoBlue = "oklch(0.72 0.14 230)";
export const crewPurple = "oklch(0.68 0.18 300)";
export const radarGreen = "oklch(0.82 0.14 155)";

// ── Typography ────────────────────────────────────────────────
export const fontSans = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
export const fontMono = "'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace";

// ── Spacing Scale ─────────────────────────────────────────────
export const spXs = "4px";
export const spSm = "6px";
export const spMd = "8px";
export const spLg = "12px";
export const spXl = "16px";
export const sp2xl = "24px";
export const sp3xl = "32px";

// ── Border Radius ─────────────────────────────────────────────
export const rSm = "5px";
export const rMd = "10px";
export const rLg = "14px";
export const rXl = "18px";

// ── Motion / Timing ───────────────────────────────────────────
export const tFast = "180ms cubic-bezier(.4, 0, .2, 1)";
export const tSmooth = "300ms cubic-bezier(.4, 0, .2, 1)";
export const tSpring = "500ms cubic-bezier(.175, .885, .32, 1.275)";
export const tSlow = "600ms cubic-bezier(.165, .84, .44, 1)";

// ── Density Overrides ─────────────────────────────────────────
export const spacingCompact = {
  spXs: "3px", spSm: "4px", spMd: "6px", spLg: "9px",
  spXl: "12px", sp2xl: "18px", sp3xl: "24px", fontSize: "12px",
} as const;

export const spacingComfortable = {
  spXs: "5px", spSm: "8px", spMd: "11px", spLg: "16px",
  spXl: "22px", sp2xl: "32px", sp3xl: "44px", fontSize: "14px",
} as const;

// ── Accent Options ─────────────────────────────────────────────
export type AccentName = "glow" | "sea" | "brass" | "cargo" | "crew";

export const accentOptions: readonly AccentName[] = [
  "glow", "sea", "brass", "cargo", "crew",
] as const;

export const accentLabels: Record<AccentName, string> = {
  glow: "Glow (cyan)",
  sea: "Sea green",
  brass: "Brass",
  cargo: "Cargo blue",
  crew: "Crew purple",
};

export const accentValues: Record<AccentName, { glow: string; glowDim: string; glowStrong: string }> = {
  glow: { glow, glowDim, glowStrong },
  sea: { glow: "oklch(0.78 0.16 155)", glowDim: "oklch(0.78 0.05 155)", glowStrong: "oklch(0.78 0.22 155)" },
  brass: { glow: "oklch(0.85 0.18 75)", glowDim: "oklch(0.85 0.05 75)", glowStrong: "oklch(0.85 0.22 75)" },
  cargo: { glow: "oklch(0.72 0.14 230)", glowDim: "oklch(0.72 0.05 230)", glowStrong: "oklch(0.72 0.22 230)" },
  crew: { glow: "oklch(0.68 0.18 300)", glowDim: "oklch(0.68 0.06 300)", glowStrong: "oklch(0.68 0.22 300)" },
};
