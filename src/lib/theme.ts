// Bridge Theme Hooks
// Reactive theme, accent, and density preferences.
// Pattern: read/write localStorage + flip data-* attributes on <html>.

import { createSignal, onCleanup } from "solid-js";
import type { AccentName } from "./tokens";

// ── Theme (dark / light / system) ─────────────────────────────

const THEME_KEY = "bridge-theme";
export type ThemeName = "dark" | "light" | "system";

function resolveTheme(pref: ThemeName): "dark" | "light" {
  if (pref === "light" || pref === "dark") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(resolved: "dark" | "light") {
  const root = document.documentElement;
  if (resolved === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
}

export function useTheme() {
  const initialTheme: ThemeName = ((localStorage.getItem(THEME_KEY) as ThemeName) || "dark");
  const [theme, setThemeSignal] = createSignal<ThemeName>(initialTheme);


  const resolved = () => resolveTheme(theme());

  // Apply on creation
  applyTheme(resolved());

  // Listen for OS-level changes when set to "system"
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const handler = () => {
    if (theme() === "system") {
      applyTheme(resolveTheme("system"));
    }
  };
  mq.addEventListener("change", handler);

  onCleanup(() => mq.removeEventListener("change", handler));

  function setTheme(pref: ThemeName) {
    setThemeSignal(pref);
    localStorage.setItem(THEME_KEY, pref);
    const r = resolveTheme(pref);
    applyTheme(r);
    window.dispatchEvent(new CustomEvent("bridge-theme", { detail: { pref, resolved: r } }));
  }

  function cycle() {
    const order: ThemeName[] = ["dark", "light", "system"];
    const i = order.indexOf(theme());
    setTheme(order[(i + 1) % order.length]);
  }

  return { theme, setTheme, resolved, cycle };
}

// ── Accent ─────────────────────────────────────────────────────

const ACCENT_KEY = "bridge-accent";
export const ACCENTS: readonly AccentName[] = ["glow", "sea", "brass", "cargo", "crew"] as const;

export const ACCENT_LABELS: Record<AccentName, string> = {
  glow: "Glow (cyan)",
  sea: "Sea green",
  brass: "Brass",
  cargo: "Cargo blue",
  crew: "Crew purple",
};

function applyAccent(name: string) {
  const root = document.documentElement;
  if (name && name !== "glow") root.setAttribute("data-accent", name);
  else root.removeAttribute("data-accent");
}

export function useAccent() {
  const stored = localStorage.getItem(ACCENT_KEY) as AccentName | null;
  const initial: AccentName = stored && ACCENTS.includes(stored) ? stored : "glow";
  const [accent, setAccentSignal] = createSignal<AccentName>(initial);

  // Apply on creation
  applyAccent(accent());

  function setAccent(name: AccentName) {
    if (!ACCENTS.includes(name)) return;
    setAccentSignal(name);
    localStorage.setItem(ACCENT_KEY, name);
    applyAccent(name);
    window.dispatchEvent(new CustomEvent("bridge-accent", { detail: { accent: name } }));
  }

  function cycle() {
    const i = ACCENTS.indexOf(accent());
    setAccent(ACCENTS[(i + 1) % ACCENTS.length]);
  }

  return { accent, setAccent, options: ACCENTS, labels: ACCENT_LABELS, cycle };
}

// ── Density ────────────────────────────────────────────────────

const DENSITY_KEY = "bridge-density";
export type DensityName = "compact" | "default" | "comfortable";
export const DENSITIES: readonly DensityName[] = ["compact", "default", "comfortable"] as const;

export const DENSITY_LABELS: Record<DensityName, string> = {
  compact: "Compact",
  default: "Default",
  comfortable: "Comfortable",
};

function applyDensity(name: string) {
  const root = document.documentElement;
  if (name && name !== "default") root.setAttribute("data-density", name);
  else root.removeAttribute("data-density");
}

export function useDensity() {
  const stored = localStorage.getItem(DENSITY_KEY) as DensityName | null;
  const initial: DensityName = stored && DENSITIES.includes(stored) ? stored : "default";
  const [density, setDensitySignal] = createSignal<DensityName>(initial);

  // Apply on creation
  applyDensity(density());

  function setDensity(name: DensityName) {
    if (!DENSITIES.includes(name)) return;
    setDensitySignal(name);
    localStorage.setItem(DENSITY_KEY, name);
    applyDensity(name);
    window.dispatchEvent(new CustomEvent("bridge-density", { detail: { density: name } }));
  }

  return { density, setDensity, options: DENSITIES, labels: DENSITY_LABELS };
}
