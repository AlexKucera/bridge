/* ThemePicker — Dark / Light / System radio toggle
   Uses useTheme() hook for state persistence. */

import { useTheme } from "../lib/theme";
import type { ThemeName } from "../lib/theme";

const THEME_OPTIONS: { value: ThemeName; label: string; icon: string }[] = [
  { value: "dark", label: "Dark", icon: "🌙" },
  { value: "light", label: "Light", icon: "☀️" },
  { value: "system", label: "System", icon: "💻" },
];

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div class="theme-picker" role="radiogroup" aria-label="Theme selection">
      {THEME_OPTIONS.map((opt) => (
        <button
          class={`theme-option ${theme() === opt.value ? "theme-option--active" : ""}`}
          role="radio"
          aria-checked={theme() === opt.value}
          aria-label={opt.label}
          value={opt.value}
          onClick={() => setTheme(opt.value)}
        >
          <span class="theme-option__icon">{opt.icon}</span>
          <span class="theme-option__label">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
