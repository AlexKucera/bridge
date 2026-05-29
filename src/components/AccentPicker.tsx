/* AccentPicker — 5 color swatches (Glow/Cyan, Sea/Green, Brass/Yellow, Cargo/Blue, Crew/Purple)
   Uses useAccent() hook for state persistence. */

import { useAccent } from "../lib/theme";
import type { AccentName } from "../lib/tokens";
import { accentLabels } from "../lib/tokens";

export function AccentPicker() {
  const { accent, setAccent, options } = useAccent();

  return (
    <div class="accent-picker" role="radiogroup" aria-label="Accent color selection">
      <div class="accent-swatches">
        {options.map((name) => (
          <button
            class={`accent-swatch accent-swatch--${name} ${accent() === name ? "accent-swatch--active" : ""}`}
            data-accent={name}
            role="radio"
            aria-checked={accent() === name}
            aria-label={accentLabels[name]}
            onClick={() => setAccent(name)}
            title={accentLabels[name]}
          >
            <span class="accent-swatch__dot" />
          </button>
        ))}
      </div>
      <div class="accent-labels">
        {options.map((name) => (
          <span
            class={`accent-label ${accent() === name ? "accent-label--active" : ""}`}
            data-accent={name}
          >
            {accentLabels[name]}
          </span>
        ))}
      </div>
    </div>
  );
}
