/* SettingsScreen — Bridge global & Pi configuration

   Uses OverlayLayout for consistent sidebar + content shell.
   Loads/saves config via Tauri commands (config_get/config_save).
   Sections: Global (theme, accent, density) | Pi (binary, model, tool policy, skills) */

import { createSignal, onMount, onCleanup } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
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

interface BridgeConfig {
  piBinaryPath: string;
  defaultProvider: string;
  defaultModel: string;
  defaultThinkingLevel: string;
  toolPolicy: string;
  globalSkillPaths: string[];
  theme: string;
  accent: string;
  density: string;
  maxConcurrency: number;
}

const DEFAULT_CONFIG: BridgeConfig = {
  piBinaryPath: "",
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4",
  defaultThinkingLevel: "low",
  toolPolicy: "AllowAll",
  globalSkillPaths: [],
  theme: "dark",
  accent: "glow",
  density: "default",
  maxConcurrency: 3,
};

export function SettingsScreen() {
  const [config, setConfig] = createSignal<BridgeConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = createSignal(false);
  const [saveStatus, setSaveStatus] = createSignal<"idle" | "saving" | "saved" | "error">("idle");
  const [lastError, setLastError] = createSignal<string | null>(null);

  async function loadConfig() {
    try {
      console.log("[Settings] Loading config via config_get...");
      const cfg = await invoke<BridgeConfig>("config_get");
      console.log("[Settings] Loaded config:", cfg);
      setConfig(cfg);
    } catch (e) {
      console.error("[Settings] Failed to load config:", e);
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }

  function updateField<K extends keyof BridgeConfig>(key: K, value: BridgeConfig[K]) {
    console.log(`[Settings] Field changed: ${key} =`, value);
    setConfig((prev) => ({ ...prev, [key]: value }));
    queueSave();
  }

  // Coalesce rapid field changes into one save (debounce 500ms)
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function queueSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveConfig();
    }, 500);
  }

  async function saveConfig() {
    setSaveStatus("saving");
    setLastError(null);
    const current = config();
    console.log("[Settings] Saving config via config_save:", current);
    try {
      await invoke("config_save", { config: current });
      console.log("[Settings] Config saved successfully");
      setSaveStatus("saved");
      // Clear saved status after 2s
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Settings] Config save FAILED:", msg);
      setLastError(msg);
      setSaveStatus("error");
    }
  }

  onMount(() => {
    loadConfig();
    // Listen for theme/accent/density changes from picker hooks
    // so they get persisted into bridge config too
    function onPrefChange() {
      // Snapshot current preferences from DOM attributes / localStorage
      const theme = localStorage.getItem("bridge-theme") || "dark";
      const accent = localStorage.getItem("bridge-accent") || "glow";
      const density = localStorage.getItem("bridge-density") || "default";
      const c = config();
      let dirty = false;
      if (c.theme !== theme) { dirty = true; }
      if (c.accent !== accent) { dirty = true; }
      if (c.density !== density) { dirty = true; }
      if (dirty) {
        setConfig((prev) => ({ ...prev, theme, accent, density }));
        queueSave();
      }
    }
    window.addEventListener("bridge-theme", onPrefChange);
    window.addEventListener("bridge-accent", onPrefChange);
    window.addEventListener("bridge-density", onPrefChange);
    onCleanup(() => {
      window.removeEventListener("bridge-theme", onPrefChange);
      window.removeEventListener("bridge-accent", onPrefChange);
      window.removeEventListener("bridge-density", onPrefChange);
    });
  });

  return (
    <OverlayLayout
      title="Settings"
      subtitle="Configure Bridge behavior, Pi launch options, and appearance"
      navSections={SETTINGS_NAV}
      currentPath="/helm/settings"
    >
      {/* Save status indicator */}
      {saveStatus() === "saving" && (
        <div class="settings-status settings-status--saving">Saving…</div>
      )}
      {saveStatus() === "saved" && (
        <div class="settings-status settings-status--saved">✓ Saved</div>
      )}
      {saveStatus() === "error" && (
        <div class="settings-status settings-status--error">
          Save failed: {lastError()}
        </div>
      )}

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
              <PiBinaryPicker
                value={config().piBinaryPath}
                onChange={(path) => updateField("piBinaryPath", path)}
              />
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
