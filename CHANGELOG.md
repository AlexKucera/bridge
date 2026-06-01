All notable changes to this project will be documented in this file. The format is based on [Common Changelog](https://common-changelog.org) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### feat

- **pi-event:** add Pi JSONL event parser (src-tauri/src/pi_event/mod.rs): PiJsonEvent enum with 14 variants covering lifecycle (Session/AgentStart/AgentEnd), turn boundaries (TurnStart/TurnEnd), message boundaries (MessageStart/MessageEnd), streaming updates via AssistantMessageEvent (ThinkingDelta, TextDelta, ToolcallStart/Delta/End), tool execution lifecycle (ToolExecutionStart/Update/End), and forward-compat Unknown { raw} variant; ParseError enum (InvalidJson/TruncatedLine/Io); parse_line() sync parser with empty-line skip and 64KB line guard; parse_jsonl_stream() async Stream wrapper; truncate_field() for 64KB-per-field truncation with marker; 23 tests including real Pi --mode json fixtures (15 fixture files)

- **pi-state:** add pure state machine reducer (src-tauri/src/pi_state/mod.rs): ExecutionViewModel with session-level state (session_id, status as LiveState enum with 9 states, tokens, cost, turns); TurnViewModel per turn (role, prompt/thinking/response text, tool_calls, metrics); ToolCallViewModel per tool call (id, name, args, status across 5 lifecycle states); apply_event() pure reducer returning Vec<StateChange> notifications; crash_recovery() function marking incomplete tools Failed on process death; field truncation integration at all accumulation sites; 19 tests including stress tests (150-event burst ordering, 150-turn volume) and crash recovery scenarios

- **tauri:** register 4 event-processing commands (event_parse_line, event_parse_jsonl, state_create_session, state_apply_event) in invoke_handler; add pi_event + pi_state module declarations to lib.rs

- **testing:** add 42 new Rust tests (23 parser + 19 state machine); 74 total tests pass across 3 suites with zero errors

- **execution:** add Pi Execution View frontend (Issue #9): 5 TS types (ExecutionViewModel, TurnViewModel, ToolCallViewModel, LiveState, ToolCallStatus) in src/lib/execution-types.ts; reactive pi-store (src/store/pi-store.ts) with signals, actions, applyEvent reducer, computed isSessionActive — 23 tests; 9 SolidJS components — SessionHeader, TurnMetricsBar, ThinkingBubble, ResponseText, ToolCallCard (5 status states), TurnList (virtualized via @solid-primitives/virtual), TurnCard, TruncatedText (50KB byte truncation), UnknownEventCard (forward-compat raw JSON) — all in src/components/execution/; PiExecutionPanel container with onMount/onCleanup lifecycle subscribing to Tauri 'execution-update' events with sessionId filtering and cleanup on unmount — 9 event integration tests; auto-scroll to bottom on new activity with scroll-lock when user scrolls up; status badge animation CSS class verification (3 tests); ~510 lines CSS; barrel export via index.ts; 106 total execution-view tests, 14/14 acceptance criteria met

- **tauri:** add event emission scaffolding (src-tauri/src/events/mod.rs) and session management (src-tauri/src/pi_session/) modules; register new commands in invoke_handler

- **config:** add Rust config module (src-tauri/src/config/mod.rs) with BridgeConfig, VesselPiConfig, PiLaunchConfig, ToolPolicy, ValidationReport types; resolve_config for 3-layer merge (global ← vessel ← launch overrides); build_pi_command for CLI construction; validate for binary/skill-path checks; detect_pi_binary via PATH + common locations; load_config/save_config JSON bootstrap at ~/.config/bridge/config.json; 16 Rust tests
- **settings:** add SettingsScreen (/helm/settings route) with OverlayLayout nav sidebar (Global + Pi sections), Appearance section (ThemePicker/AccentPicker/DensityPicker), Pi Configuration section (PiBinaryPicker with auto-detect button), and ValidationStatus panel (per-check Pass/Warn/Fail results with refresh)
- **components:** add ThemePicker (dark/light/system radio toggle), AccentPicker (5 color swatches), DensityPicker (compact/default/comfortable), PiBinaryPicker (text input + config_detect_binary Tauri command), ValidationStatus (config_validate Tauri command with overall badge + per-check list); 29 new frontend tests
- **css:** add ~340 lines of settings styles: .setting block pattern (280px label + fluid control), glow-bar section titles (.settings-section__title), kbd keyboard hints, theme/accent/density picker styles, pi binary picker (mono input + glow border), validation panel (overall badge + per-check rows with Pass/Warn/Fail color coding)
- **tauri:** register 4 new config commands (config_get, config_save, config_validate, config_detect_binary) in invoke_handler; add dirs = "5" dependency for config directory resolution

### feat

- **fleet-dashboard:** wire AddVesselDialog into FleetDashboard with +Add button, live vessel list from vessel_list_with_git, and submit handler that calls vessel_add and refreshes; add @tauri-apps/api dependency for Tauri invoke calls

### feat

- **execution:** close remaining AC gaps for Issue #9 Execution View (TDD): UnknownEventCard component for forward-compat rendering of unknown/future Pi event types as collapsible raw JSON blocks (7 tests); auto-scroll to bottom on new turn/activity arrival with scroll-lock when user manually scrolls up and resume-on-return (3 tests); virtualized TurnList rendering via @solid-primitives/virtual VirtualList component for 100+ turn sessions without jank (2 tests); status badge animation CSS class verification per LiveState phase — active states get --active pulse, terminal states solid, idle states get --idle (3 tests); store applyEvent default case captures unknown events in unknownEvents array; 22 new tests total, 0 regressions, 106 execution-view tests pass
### fix

- **settings:** fix SettingsScreen config persistence: (1) wire PiBinaryPicker onChange from no-op `{}` to real `updateField()` handler; (2) rename TS BridgeConfig interface keys from snake_case to camelCase to match Rust `#[serde(rename_all = "camelCase")]` — saves were silently writing empty defaults because serde ignored unknown snake_case keys; (3) change `config_dir()` from platform-specific `dirs::config_dir()` (`~/Library/Application Support/` on macOS) to explicit `~/.config/bridge/` per Issue #6 spec; add visible save status banner (saving/saved/error), 500ms debounced saves, `[Settings]`-prefixed console diagnostics, and theme/accent/density event listeners for picker sync

- **tauri:** fix startup panic caused by calling `tokio::runtime::Handle::current()` in Tauri setup closure where no Tokio runtime exists — replaced with `Runtime::new()` to create a dedicated runtime for DB init (lib.rs:30)


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
- **nav:** extract BottomNavBar as pure presentational component with 5 sections (Fleet, Charts, Log, Helm, Welcome), glow underline active state, and digit 1–5 keyboard shortcuts
- **router:** wire @solidjs/router mapping 6 routes to screen components with ChromeLayout as shared root layout; fix redirect→Navigate import
- **screens:** implement WelcomeScreen (hero, tagline, meta badges, 4 navigation preview cards) and 5 overlay screen stubs using OverlayLayout sidebar+content shell
- **overlay:** add OverlayLayout component for consistent 240px nav-sidebar + fluid content layout across Helm/Log/Charts screens
- **testing:** add 54 Vitest assertions across 6 test files covering navbar, keyboard shortcuts, welcome cards, overlay layout, responsive structure, and route mapping (257 total)
