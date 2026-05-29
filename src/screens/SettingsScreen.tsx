/* SettingsScreen — Bridge global & Pi configuration

   Uses OverlayLayout for consistent sidebar + content shell.
   Sections: Global (theme, accent, density) | Pi (binary, model, tool policy, skills) */

import { OverlayLayout } from "../components/OverlayLayout";
import { ThemePicker } from "../components/ThemePicker";
import { AccentPicker } from "../components/AccentPicker";
import { DensityPicker } from "../components/DensityPicker";
import { PiBinaryPicker } from "../components/PiBinaryPicker";
import { ValidationStatus } from "../components/ValidationStatus";

const SETTINGS_NAV = [
  {
    title: "Global",
    items: [
      { href: "/helm/settings", label: "Appearance", icon: "🎨" },
      { href: "/helm/settings", label: "General", icon: "⚙️" },
    ],
  },
  {
    title: "Pi",
    items: [
      { href: "/helm/settings", label: "Binary", icon: "📦" },
      { href: "/helm/settings", label: "Model", icon: "🤖" },
      { href: "/helm/settings", label: "Tools", icon: "🔧" },
      { href: "/helm/settings", label: "Skills", icon: "📚" },
    ],
  },
] as const;

export function SettingsScreen() {
  return (
    <OverlayLayout
      title="Settings"
      subtitle="Configure Bridge behavior, Pi launch options, and appearance"
      navSections={SETTINGS_NAV}
      currentPath="/helm/settings"
    >
      <div class="settings-grid">
        <section class="settings-section">
          <h2 class="settings-section__title">Appearance</h2>
          <div class="setting">
            <label class="setting__label">
              Theme
              <kbd class="setting__kbd">T</kbd>
            </label>
            <div class="setting__control">
              <ThemePicker />
            </div>
          </div>
          <div class="setting">
            <label class="setting__label">
              Accent
              <kbd class="setting__kbd">A</kbd>
            </label>
            <div class="setting__control">
              <AccentPicker />
            </div>
          </div>
          <div class="setting">
            <label class="setting__label">
              Density
              <kbd class="setting__kbd">D</kbd>
            </label>
            <div class="setting__control">
              <DensityPicker />
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2 class="settings-section__title">Pi Configuration</h2>
          <div class="setting">
            <label class="setting__label">
              Pi Binary
              <kbd class="setting__kbd">P</kbd>
            </label>
            <div class="setting__control">
              <PiBinaryPicker value="" onChange={() => {}} />
            </div>
          </div>
          <div class="setting">
            <label class="setting__label">
              Default Model
            </label>
            <div class="setting__control">
              <p>Model selector coming soon</p>
            </div>
          </div>
          <div class="setting">
            <label class="setting__label">
              Tool Policy
            </label>
            <div class="setting__control">
              <p>Tool policy editor coming soon</p>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <h2 class="settings-section__title">Validation</h2>
          <ValidationStatus />
        </section>
      </div>
    </OverlayLayout>
  );
}
