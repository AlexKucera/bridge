/* DensityPicker — Compact / Default / Comfortable radio toggle
   Uses useDensity() hook for state persistence. */

import { useDensity } from "../lib/theme";
import type { DensityName } from "../lib/theme";

const DENSITY_OPTIONS: { value: DensityName; label: string; desc: string }[] = [
  { value: "compact", label: "Compact", desc: "Less spacing" },
  { value: "default", label: "Default", desc: "Standard" },
  { value: "comfortable", label: "Comfortable", desc: "More spacing" },
];

export function DensityPicker() {
  const { density, setDensity } = useDensity();

  return (
    <div class="density-picker" role="radiogroup" aria-label="Density selection">
      {DENSITY_OPTIONS.map((opt) => (
        <button
          class={`density-option ${density() === opt.value ? "density-option--active" : ""}`}
          role="radio"
          aria-checked={density() === opt.value}
          onClick={() => setDensity(opt.value)}
        >
          <span class="density-option__label">{opt.label}</span>
          <span class="density-option__desc">{opt.desc}</span>
        </button>
      ))}
    </div>
  );
}
