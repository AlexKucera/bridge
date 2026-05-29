# Slice 4: Helm Settings & Config Resolution

> **Date:** 2026-05-29
> **Type:** slice
> **Reference:** [Issue #6 — Slice 4: Helm Settings & Config Resolution](https://github.com/AlexKucera/bridge/issues/6)

## Goal

Build the Bridge configuration system (Rust backend) and the Helm Settings UI (frontend) per Issue #6. This includes:

- Rust `config` module with types, 3-layer merge resolution, command building, validation, and JSON file bootstrap
- Helm Settings screen with overlay layout, nav sidebar, setting blocks, theme/accent/density pickers, Pi binary picker with auto-detect, and validation status panel
- Tauri commands bridging frontend ↔ config backend

## What Was Done

### Rust Backend: `src-tauri/src/config/mod.rs` (16 tests)

**Types defined:**
- `ToolPolicy` enum — `AllowAll`, `Allowlist(Vec<String>)`, `Denylist(Vec<String>)`, `None_` (serialized as `"none"` via `#[serde(rename = "none")]`)
- `QuickPrompt { title, template_text }`
- `LaunchOverrides { prompt?, mode?, model?, thinking_level? }`
- `VesselPiConfig { provider?, model?, thinking_level?, tool_policy?, skill_paths?, context_files?, hooks? }` — all Optional; None = inherit from global
- `BridgeConfig` — global settings (pi_binary_path, default_provider, default_model, default_thinking_level, tool_policy, global_skill_paths, theme, accent, density, max_concurrency); has sensible defaults via `Default` impl
- `PiLaunchConfig` — fully resolved output of merge (binary, args, env, cwd, session_dir, mode, provider, model, thinking_level, tool_policy, skill_paths)
- `ValidationCheck { name, status, message }` + `ValidationStatus` (Pass/Warn/Fail) + `ValidationReport { checks, overall }`
- `ConfigError` enum — `NoConfigDir`, `Io(String)`, `Json(String)` (String wrappers for Tauri IPC Serialize compatibility)

**Core functions:**
- `resolve_config(global, vessel?, overrides?) → PiLaunchConfig` — 3-layer merge. Precedence: global ← vessel (Optional fields inherit) ← launch overrides (highest). Model and thinking_level have double-fallback chain (overrides → vessel → global). Mode defaults to `"chat"`.
- `build_pi_command(&PiLaunchConfig) → std::process::Command` — constructs Command with binary, args, env vars, cwd
- `validate(&BridgeConfig) → ValidationReport` — checks binary existence/executable (empty=Warn, missing=Fail, not-executable=Fail, ok=Pass), then each skill path reachable (Pass/Fail). Overall status derived: any Fail→Fail, else any Warn→Warn, else Pass.
- `detect_pi_binary() → Option<String>` — runs `which pi` first, falls back to searching `/usr/local/bin`, `/usr/bin`, `/opt/homebrew/bin`, `~/.local/bin`, `~/.cargo/bin`
- `load_config() → Result<BridgeConfig, ConfigError>` — reads `~/.config/bridge/config.json`; returns `Default` if file doesn't exist
- `save_config(&BridgeConfig) → Result<(), ConfigError>` — writes pretty JSON, creates dirs as needed
- `config_dir()` / `config_path()` — resolve to `~/.config/bridge/`

**Tauri commands in `src-tauri/src/commands.rs`:**
- `config_get` → `BridgeConfig`
- `config_save(BridgeConfig)` → `()`
- `config_validate` → `ValidationReport`
- `config_detect_binary` → `Option<String>`

**Dependencies added:** `dirs = "5"` in Cargo.toml

### Frontend: Settings Screen + Components (29 new tests)

**Route registered:** `/helm/settings` → `SettingsScreen` in App.tsx

**Components created:**
- `SettingsScreen` (`src/screens/SettingsScreen.tsx`) — OverlayLayout with Global (Appearance, General) + Pi (Binary, Model, Tools, Skills) nav sections. Three content sections: Appearance (ThemePicker/AccentPicker/DensityPicker), Pi Configuration (PiBinaryPicker), Validation (ValidationStatus).
- `ThemePicker` (`src/components/ThemePicker.tsx`) — Dark/Light/System radio toggle using existing `useTheme()` hook. Renders icon+label buttons with active state styling.
- `AccentPicker` (`src/components/AccentPicker.tsx`) — 5 color swatches (Glow/Cyan, Sea/Green, Brass/Yellow, Cargo/Blue, Crew/Purple) using existing `useAccent()` hook. Swatch dots + label row.
- `DensityPicker` (`src/components/DensityPicker.tsx`) — Compact/Default/Comfortable radio toggle using existing `useDensity()` hook.
- `PiBinaryPicker` (`src/components/PiBinaryPicker.tsx`) — Mono text input + "Auto-detect" button calling `invoke("config_detect_binary")`. Shows error state when detection fails.
- `ValidationStatus` (`src/components/ValidationStatus.tsx`) — Calls `invoke("config_validate")` on mount + refresh button. Renders overall badge (Pass/Warn/Fail) + per-check list with color-coded rows.

**CSS added to `src/bridge.css` (~340 lines):**
- `.settings-grid` / `.settings-section` / `.settings-section__title` (glow bar left border)
- `.setting` block pattern: `grid-template-columns: 280px 1fr` with responsive collapse at 640px
- `.setting__label` + `.setting__kbd` (keyboard shortcut hints)
- `.theme-picker` / `.theme-option` / `.theme-option--active`
- `.accent-picker` / `.accent-swatches` / `.accent-swatch` (per-accent CSS custom property `--sw`)
- `.density-picker` / `.density-option` / `.density-option--active`
- `.pi-binary-picker` / `.pi-binary-picker__input` (mono font) / `.pi-binary-picker__detect` (glow border)
- `.validation-status__header` / `.validation-overall` (3 variants) / `.validation-checks` / `.validation-check` (3 status variants)

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| JSON file primary storage (`~/.config/bridge/config.json`) over DB | User chose this per issue spec. DB tables (`bridge_config`, `appearance_prefs`) exist but are reserved for runtime data. File is portable, human-editable, matches the issue exactly. |
| Backend-first approach (Rust before UI) | Config logic is pure, highly testable, no DOM dependency. Building it first means UI components have a real backend to call. Also follows the user's preference from planning phase. |
| `#![allow(dead_code)]` on config module | Types like `VesselPiConfig`, `PiLaunchConfig`, `resolve_config`, `build_pi_command` are public API that will be wired to additional Tauri commands in future slices (e.g., actual Pi launch). Suppressing warnings is cleaner than `#[allow]` on each item or adding placeholder commands. |
| `ConfigError` uses `String` wrappers for inner errors | Tauri v2 IPC requires `Serialize` on error types returned from commands. `std::io::Error` and `serde_json::Error` don't implement `Serialize`. Converting to String via `.to_string()` is the same pattern used by `VesselError::Database`. |
| ToolPolicy variant named `None_` with serde rename | Rust reserves `None` as a constructor name for `Option`. Using `None_` with `#[serde(rename = "none")]` gives clean JSON while avoiding the keyword conflict. |
| Pickers reuse existing hooks (`useTheme`, `useAccent`, `useDensity`) | These hooks already existed in `lib/theme.ts` from earlier slices with localStorage persistence + data-attribute flipping. No need to duplicate that logic — the picker components are thin UI shells over proven hooks. |
| Validation ordering: empty check before existence check | The `validate()` function must check `is_empty()` before checking `path.exists()` because an empty string would resolve to a nonsensical path. Test caught this: empty path was returning Fail instead of Warn because the skill-path check (from default config's `/skills/default`) was elevating overall to Fail. |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| Conflicting `From<serde_json::Error>` impls for `ConfigError` | Had both `Parse(#[from] serde_json::Error)` and `Serialize(#[from] serde_json::Error)` variants | Merged into single `Json(String)` variant with manual `.map_err(\|e\| ConfigError::Json(e.to_string()))` at call sites |
| `ToolPolicy::None_` serializes as `"none_"` instead of `"none"` | Serde derives `rename_all` from the Rust identifier by default | Added `#[serde(rename = "none")]` attribute on the variant |
| Empty binary path returns Fail instead of Warn | Default test fixture includes a non-existent skill path `/skills/default`; when testing empty binary alone, the skill check failure elevated overall to Fail | Fixed test to clear `global_skill_paths` when isolating binary check behavior |
| Tauri IPC compile error: `ConfigError` doesn't satisfy `IpcResponse` | Tauri v2 requires `Serialize` on command error types; `std::io::Error` doesn't implement it | Changed `ConfigError` variants to wrap `String` instead of foreign error types, added `serde::Serialize` derive |
| Edit mangled config module header (stray comment lines) | Anchor-based edit with `append` after a comment line duplicated content | Manual cleanup pass to remove duplicate section header comments |
| Duplicate `use sqlx::Sqlite;` line in commands.rs | Remove-unused-import edit left a duplicate | Cleaned up to single import |
| 11 pre-existing frontend test failures | Router/welcome tests fail due to `[object Object]` rendering in jsdom (pre-existing before this session) | Verified these failures exist on clean HEAD too; zero regressions from our changes |

## Files Changed

| File | Change Summary |
|------|---------------|
| `src-tauri/src/config/mod.rs` | **New.** Full config module: types (ToolPolicy, BridgeConfig, VesselPiConfig, PiLaunchConfig, etc.), resolve_config, build_pi_command, validate, detect_pi_binary, load_config, save_config. 16 tests. ~680 lines. |
| `src-tauri/src/commands.rs` | Added 4 config Tauri commands: config_get, config_save, config_validate, config_detect_binary. Removed unused serde_json::Value import. |
| `src-tauri/src/lib.rs` | Registered `mod config` and added 4 config commands to invoke_handler. |
| `src-tauri/Cargo.toml` | Added `dirs = "5"` dependency. |
| `src/screens/SettingsScreen.tsx` | **New.** Helm Settings screen with OverlayLayout, Global+Pi nav, Appearance/Pi Config/Validation sections. Wires ThemePicker, AccentPicker, DensityPicker, PiBinaryPicker, ValidationStatus. |
| `src/components/ThemePicker.tsx` | **New.** Dark/Light/System radio toggle using useTheme(). |
| `src/components/AccentPicker.tsx` | **New.** 5-color swatch picker using useAccent(). |
| `src/components/DensityPicker.tsx` | **New.** Compact/Default/Comfortable picker using useDensity(). |
| `src/components/PiBinaryPicker.tsx` | **New.** Text input + Auto-detect button calling config_detect_binary Tauri command. |
| `src/components/ValidationStatus.tsx` | **New.** Per-check validation panel calling config_validate. Overall badge + refresh. |
| `src/App.tsx` | Added `/helm/settings` route → SettingsScreen. |
| `src/bridge.css` | Added ~340 lines: settings grid, setting block pattern (280px label), glow bar section titles, kbd hints, all picker styles, pi binary input, validation panel. |
| `src/tests/settings.test.tsx` | **New.** 7 tests: title, nav sections, appearance/pi/validation sections, kbd hints, overlay structure. |
| `src/tests/pickers.test.tsx` | **New.** 9 tests: ThemePicker (3), AccentPicker (4), DensityPicker (2). |
| `src/tests/pi-binary-picker.test.tsx` | **New.** 6 tests: render, value display, auto-detect button, onChange, detect invocation, error state. |
| `src/tests/validation-status.test.tsx` | **New.** 7 tests: header, refresh, overall status, individual checks, Fail/Warn styling, validate invocation. |

## Open Items & Next Steps

- [ ] **Model selector control** — SettingsScreen still shows "Model selector coming soon" stub. Needs provider dropdown + model text input + thinking level dropdown.
- [ ] **Tool policy editor** — Still shows "Tool policy editor coming soon". Needs radio group (Allow All / Allowlist / Denylist / None) + conditional textarea for list entries.
- [ ] **Skill manager** — Not yet built. Needs list of skill paths with add/remove + per-path validation.
- [ ] **Wire SettingsScreen to live config** — Currently PiBinaryPicker uses empty string + noop onChange. Should load/save from `config_get`/`config_save` Tauri commands.
- [ ] **Per-vessel config overrides** — Accessible from VesselDetailScreen (Slice 14 per issue). `VesselPiConfig` type is ready but no UI or vessel-scoped commands yet.
- [ ] **Actual Pi launch integration** — `resolve_config` + `build_pi_command` exist but nothing calls them to launch a process yet. That's a future slice.
- [ ] **11 pre-existing frontend test failures** — Router and welcome tests fail in jsdom due to `[object Object]` rendering. Not introduced by this slice but should be fixed eventually.

## Test Counts

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Rust (cargo test) | 15 | 31 | +16 |
| Frontend (vitest) | 272 | 290 (+11 pre-existing fail) | +18 new, 0 regressions |
| **Total passing** | **287** | **321** | **+34** |

---

*Log written by write-log skill*
