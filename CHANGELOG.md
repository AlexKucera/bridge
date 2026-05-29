All notable changes to this project will be documented in this file. The format is based on [Common Changelog](https://common-changelog.org) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### feat

- **config:** add Rust config module (src-tauri/src/config/mod.rs) with BridgeConfig, VesselPiConfig, PiLaunchConfig, ToolPolicy, ValidationReport types; resolve_config for 3-layer merge (global ← vessel ← launch overrides); build_pi_command for CLI construction; validate for binary/skill-path checks; detect_pi_binary via PATH + common locations; load_config/save_config JSON bootstrap at ~/.config/bridge/config.json; 16 Rust tests
- **settings:** add SettingsScreen (/helm/settings route) with OverlayLayout nav sidebar (Global + Pi sections), Appearance section (ThemePicker/AccentPicker/DensityPicker), Pi Configuration section (PiBinaryPicker with auto-detect button), and ValidationStatus panel (per-check Pass/Warn/Fail results with refresh)
- **components:** add ThemePicker (dark/light/system radio toggle), AccentPicker (5 color swatches), DensityPicker (compact/default/comfortable), PiBinaryPicker (text input + config_detect_binary Tauri command), ValidationStatus (config_validate Tauri command with overall badge + per-check list); 29 new frontend tests
- **css:** add ~340 lines of settings styles: .setting block pattern (280px label + fluid control), glow-bar section titles (.settings-section__title), kbd keyboard hints, theme/accent/density picker styles, pi binary picker (mono input + glow border), validation panel (overall badge + per-check rows with Pass/Warn/Fail color coding)
- **tauri:** register 4 new config commands (config_get, config_save, config_validate, config_detect_binary) in invoke_handler; add dirs = "5" dependency for config directory resolution

### feat

- **fleet-dashboard:** wire AddVesselDialog into FleetDashboard with +Add button, live vessel list from vessel_list_with_git, and submit handler that calls vessel_add and refreshes; add @tauri-apps/api dependency for Tauri invoke calls

### fix
- **tauri:** fix startup panic caused by calling `tokio::runtime::Handle::current()` in Tauri setup closure where no Tokio runtime exists — replaced with `Runtime::new()` to create a dedicated runtime for DB init (lib.rs:30)
- **chrome:** fix blank window caused by three layout bugs: (1) `<Navigate>` breaking SolidJS router context — replaced with explicit leaf route; (2) `.launcher` duplicating `.app` chrome grid inside content area — changed to plain scrolling block; (3) missing scroll containment on `.app__main` — added `min-height: 0; overflow-y: auto` so bottom nav stays pinned. Also fixed `href==` typos in 3 screen files and 3 mismatched router test assertions (264 pass, 0 fail)

### feat

- **db:** add SQLite data layer with sqlx migrate system: 7-table initial schema (vessels, vessel_configs, bridge_config, sessions, quick_prompts, log_events with 4 indexes, appearance_prefs), DB pool initialized at Tauri startup in app data directory (3 Rust tests)
- **vessel:** add vessel CRUD module with 6 Tauri commands: vessel_add (path validation for git repos, duplicate rejection), vessel_list / vessel_list_with_git (sorted by name, resolves git branch and dirty state via CLI), vessel_get, vessel_rename, vessel_remove with cascade delete of dependent data; VesselError enum with Serialize for Tauri v2 IPC (12 Rust tests)
- **fleet-dashboard:** replace placeholder with 3-column CSS grid layout (180px sidebar | 1fr content | 280px activity feed) inside OverlayLayout shell
- **vessel-card:** add VesselCard component with status dot (4 states), display name, branch label, dirty indicator, selection highlight via border-left accent bar, and onContextMenu handler (7 tests)
- **add-vessel-dialog:** add AddVesselDialog modal with path text input, native directory picker (__TAURI__.dialog.open), auto-filled display name from dirname, validation error display, and Cancel/Confirm actions (4 tests)
- **testing:** add 15 new test assertions across 4 test files for fleet layout, vessel card rendering, dialog interaction, and context menu events (287 total: 272 frontend + 15 Rust)

- **scaffold:** initialize Tauri v2 + SolidJS + Vite project with Rust crate dependencies (tokio, serde, sqlx, portable-pty)
- **design-system:** port complete 30-section CSS design system (1959 lines) from prototype with oklch color tokens, theme/accent/density switchers, and reduced-motion support
- **hooks:** add useTheme(), useAccent(), useDensity() SolidJS hooks with localStorage persistence and data-* attribute flipping
- **tokens:** add TypeScript constants mirroring all CSS custom property values
- **testing:** add 203 Vitest assertions across 7 test files covering scaffold, tokens, base styles, theme switching, component primitives, hooks, and launch readiness
- **chrome:** add app shell (titlebar + content + bottom nav) via ChromeLayout with 32px/1fr/48px CSS grid and theme data-attributes
- **nav:** extract BottomNavBar as pure presentational component with 5 sections (Fleet, Charts, Log, Helm, Welcome), glow underline active state, and digit 1–5 keyboard shortcuts
- **router:** wire @solidjs/router mapping 6 routes to screen components with ChromeLayout as shared root layout; fix redirect→Navigate import
- **screens:** implement WelcomeScreen (hero, tagline, meta badges, 4 navigation preview cards) and 5 overlay screen stubs using OverlayLayout sidebar+content shell
- **overlay:** add OverlayLayout component for consistent 240px nav-sidebar + fluid content layout across Helm/Log/Charts screens
- **testing:** add 54 Vitest assertions across 6 test files covering navbar, keyboard shortcuts, welcome cards, overlay layout, responsive structure, and route mapping (257 total)
