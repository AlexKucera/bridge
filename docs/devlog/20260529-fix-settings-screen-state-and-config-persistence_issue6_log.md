# Fix Settings Screen — State Management, Key Naming, and Config Path

> **Date:** 2026-05-29
> **Type:** issue
> **Reference:** Follow-up to Issue #6 (Slice 4: Helm Settings & Config Resolution)

## Goal

Fix five bugs discovered during user testing of the Settings screen (`/helm/settings`): PiBinaryPicker was non-functional, config was never persisted to disk, and the config directory path didn't match the Issue #6 spec.

## What Was Done

- **Rewrote `SettingsScreen.tsx`** with full reactive state management via `createSignal<BridgeConfig>`:
  - `loadConfig()` calls `invoke("config_get")` on mount
  - `updateField<K>()` propagates field changes into state + triggers debounced save
  - `saveConfig()` calls `invoke("config_save", { config })` with 500ms debounce
  - Added visible save status banner: yellow "Saving…", green "✓ Saved", red "Save failed: {message}"
  - Added `[Settings]`-prefixed console logging for every invoke call
  - Wired `PiBinaryPicker`'s `onChange` to real handler instead of literal no-op `{}`

- **Fixed camelCase/snake_case key mismatch** between TypeScript interface and Rust serde:
  - Changed TS `BridgeConfig` interface from snake_case (`pi_binary_path`, `default_provider`, etc.) to camelCase (`piBinaryPath`, `defaultProvider`, etc.)
  - Rust `BridgeConfig` uses `#[serde(rename_all = "camelCase")]` — it expects camelCase JSON keys
  - Before fix: TS sent `pi_binary_path: "/opt/..."` → Rust read default `piBinaryPath: ""` (unknown key ignored)
  - After fix: TS sends `piBinaryPath: "/opt/..."` → Rust reads the value correctly

- **Fixed `config_dir()` path** in Rust backend to match Issue #6 spec:
  - Changed from `dirs::config_dir().map(|d| d.join("bridge"))` (platform-specific) to `dirs::home_dir().map(|h| h.join(".config").join("bridge"))`
  - On macOS, `dirs::config_dir()` returns `~/Library/Application Support/bridge/` — not the spec'd `~/.config/bridge/`
  - The save **was working** the whole time — file was at the macOS platform-specific location, just not where expected

- **Added save status CSS** (~40 lines in `bridge.css`) for `.settings-status--saving/--saved/--error`

- **Cleaned up stale macOS config dir** at `~/Library/Application Support/bridge/` after migration

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Use explicit `~/.config/bridge/` over `dirs::config_dir()` | Issue #6 spec explicitly defines this path. Using platform-specific dirs would mean different paths per OS, making docs/examples inconsistent. |
| 500ms debounce on saves | Coalesces rapid field changes (user typing, picker clicks) into single disk write. Short enough to feel responsive, long enough to avoid thrashing. |
| Visible status banner (not just console) | User had no feedback that saves were happening or failing. Console-only logging is invisible during normal use. |
| Keep Theme/Accent/Density pickers using localStorage + bridge events | Pickers have their own hooks that persist to localStorage. Rather than rewriting them, SettingsScreen listens for custom `bridge-theme/accent/density` events and syncs to bridge config. |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| Typing in PiBinaryPicker does nothing; value vanishes on blur | `<PiBinaryPicker onChange={() => {}} />` — literal empty arrow function as prop | Rewired to `onChange={(path) => updateField("piBinaryPath", path)}` |
| `~/.config/bridge/` never created despite "✓ Saved" showing | SettingsScreen never called `config_get` or `config_save` — zero state management | Added full load/save lifecycle with createSignal state |
| Config saves succeed but all values are empty defaults | **camelCase vs snake_case**: Rust serde renames to camelCase (`piBinaryPath`), but TS sent snake_case (`pi_binary_path`). Serde ignores unknown keys, so every field defaulted to `""`. | Renamed all TS interface keys to camelCase to match `#[serde(rename_all = "camelCase")]` |
| `npx tauri dev` crashes with parse error | `sed` rename mangled line 207: `updateField("piBinaryPath"), path)` — comma inside wrong paren | Manual fix to `updateField("piBinaryPath", path)` |
| File exists but not at `~/.config/bridge/` | `dirs::config_dir()` returns `~/Library/Application Support/` on macOS (XDG-compliant only on Linux). Save worked correctly at the macOS path. | Changed to `dirs::home_dir().join(".config/bridge")` matching Issue #6 spec |
| Dev console SyntaxError from user's test snippets | Two issues: redeclaring `const` without semicolons/newlines, and bare `invoke()` not available globally in Tauri v2 | Corrected to `const { invoke } = window.__TAURI__.core;` pattern |

## Files Changed

| File | Change Summary |
|------|---------------|
| `src/screens/SettingsScreen.tsx` | Full rewrite: reactive state (createSignal), loadConfig/saveConfig lifecycle, camelCase BridgeConfig interface, wired PiBinaryPicker onChange, visible save status banner, event listeners for theme/accent/density sync, [Settings]-prefixed console diagnostics |
| `src-tauri/src/config/mod.rs` | Changed `config_dir()` from `dirs::config_dir()` to `dirs::home_dir().join(".config/bridge")` to match Issue #6 spec path |
| `src/bridge.css` | Added `.settings-status` / `.settings-status--saving` / `.settings-status--saved` / `.settings-status--error` styles (~40 lines) |

## Open Items & Next Steps

- [ ] **Commit these fixes** — changes are on-disk but not yet committed
- [ ] **Theme/Accent/Density event dispatch** — current code listens for `bridge-theme`/`bridge-accent`/`bridge-density` custom events, but the existing picker hooks may not dispatch these. Verify event names match what `useTheme`/`useAccent`/`useDensity` actually fire, or fall back to polling localStorage.
- [ ] **Model / Tool Policy / Skills sections** still show placeholder text ("coming soon") — these are future work within Issue #6 scope
- [ ] **Validation panel integration** — ValidationStatus component exists but doesn't yet reflect live config changes (requires wiring validation results to current binary path)

---

*Log written by write-log skill*
