All notable changes to this project will be documented in this file. The format is based on [Common Changelog](https://common-changelog.org) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### feat

- **cargo:** add Git operations panel with diff review, commit, and push (Issue #12):

  - **Rust backend** (src-tauri/src/cargo/mod.rs): cargo_status (porcelain=v2 parser), cargo_diff (numstat+unified), cargo_commit (stage+commit), cargo_push (categorized errors), generate_commit_message (conventional format + co-author); 20 Rust tests

  - **Tauri commands** (commands.rs + lib.rs): 5 async commands (cargo_status, cargo_diff, cargo_commit, cargo_push, cargo_generate_message) with explicit std::result::Result return type

  - **Frontend types** (cargo-types.ts): TypeScript mirrors of all Rust enums/structs + changeTypeIcon/changeTypeColor helpers; 8 tests

  - **Frontend store** (cargo-store.ts): SolidJS factory store with fetchStatus/fetchDiff/selectFile/setCommitMessage/setSail/generateMessage/refresh actions; mocked invoke for testing; 11 tests

  - **UI components** (components/cargo/): SummaryStatsBar (colored +/-/~ stats), FileDiffList (change-type icons, monospace paths), DiffSnippetViewer (unified diff, green/red/grey lines, JetBrains Mono), CommitMessageEditor (char/line indicators), ConflictWarningBanner (merge/conflict state), SetSailButton (⚓ spinner), CargoPanel (orchestrator with toasts, split-pane layout)

  - **CSS** (cargo.css): Dark-theme styling matching Bridge design system; diff syntax highlighting; Set Sail gradient button with hover animation

  - **Bug fixes**: TabBar test IDs (tab-badge-* prefix) and class names (tab-bar__tab--active) — 15/15 passing; CargoPanel default import fix; blank panel fix (always-create store pattern)

- **vessel:** wire vessel click → detail → launch flow (post-Issue #11):

  - **VesselDetailScreen** full rewrite: loads vessel data via `vessel_get` command, shows info card with Launch button, integrates LaunchDialog for mode/prompt/template selection, creates TabStore+PtyStore+PiExecutionStore on launch, renders SessionViewContainer with terminal tabs post-launch

  - **LaunchDialog** fix: added missing `createSignal`, `createEffect`, `Show`, `invoke` imports that caused `ReferenceError: Can't find variable: createSignal` on navigation to `/vessel/:id`

  - **FleetDashboard** navigation wiring: `handleVesselClick` → `navigate(/vessel/:id)` connected to VesselCard onClick

  - **Test fixes**: added `useLocation` mock to test-setup.ts; fixed orphaned expect in router.test.tsx

- **terminal:** add Comms Deck PTY terminal with xterm.js integration, tab switching, scan-line overlay animation, and log-line color classifier (Issue #11):

  - **Rust PTY backend** (src-tauri/src/pi_session/pty.rs + pty_output.rs): PtySession wrapping portable-pty with spawn/write/read/resize; PtyOutputPayload/PtyExitPayload with base64 encoding for binary-safe JSON transport; PtyOutputLoop reading stdout via blocking thread → mpsc channel; spawn_output_reader() for non-blocking output capture; run_output_loop() read-until-EOF with exit detection; 9 integration tests exercising full pipeline (echo, session ID propagation, timestamps, JSON serialization, base64 round-trip, multi-line, exit ordering)

  - **Session infrastructure** (src-tauri/src/pi_session/mod.rs): SessionProcess::Taken sentinel variant for take_pty() extraction; RunningSession methods (is_pty, is_child, take_pty); session_launch Tauri command with full pipeline — parse mode → deserialize overrides → load config → launch session → if PTY: take_pty → create mpsc channel → start PtyOutputLoop → spawn tokio task forwarding events via app.emit("pty-output"/"pty-exit") → insert into registry

  - **Tauri commands** (src-tauri/src/commands.rs + lib.rs): pty_write (stdin forwarding), pty_resize (terminal geometry sync), session_launch (full launch with PTY wiring); register all commands in invoke_handler

  - **Frontend terminal** (src/components/terminal/): CommsDeckPanel with xterm.js Terminal, FitAddon, ResizeObserver, status bar (CONNECTED/EXITED states), keydown→invoke("pty_write") input path, listen("pty-output"/"pty-exit") event handlers with base64 decode; ScanLineOverlay with CSS @keyframes scanline-sweep animation, prefers-reduced-motion static fallback; inline SVG icons for terminal/tab UI

  - **Tab architecture** (src/store/tab-store.ts + src/components/terminal/TabBar.tsx + SessionViewContainer.tsx): TabStore with activeTab signal, badge counts per-tab, auto-clear on switch; TabBar with ARIA tablist, inline SVG icons (Structured/Terminal), keyboard navigation; SessionViewContainer always-mounted pattern (visibility:hidden over display:none) preserving xterm.js state across switches; defaultMode mapping (json→Structured, pty→Terminal)

  - **LogLineClassifier** (src/lib/log-line-classifier.ts): classifyLine() priority-ordered pattern matching (Error>Warn>Prompt>Info>Dim>Plain) tuned for Pi/CLI/shell output; getAnsiForClass() ANSI escape prefix mapping (bright colors 90-97 for dark-bg contrast); classifyAndColorize() integrated classification+colorization with reset sequences; configurable via LogLineClassifierConfig; wired into CommsDeckPanel term.write() path; 42 tests across 3 TDD cycles

  - **Types & stores**: terminal-types.ts (PtyStatus, PtyOutputEvent), tab-types.ts (TabId, TabStoreOptions), pty-store.ts (PtyStore with status/output/clearState signals)

  - **Dependencies**: xterm + xterm-addon-fit (npm), portable-pty (Cargo)

  - **Tests**: 139 Rust (130 existing + 9 integration), 539 frontend (497 existing + 42 classifier); 11/11 acceptance criteria met

- **execution:** add streaming animations and UX controls for Execution View (Issue #10): LiveIndicator phase badge with color-coded states and pulse animation for active phases (Thinking/RunningTool/StreamingText) — 8 tests; ResponseText character-by-character streaming with blinking cursor that disappears on complete — 4 tests; ThinkingBubble live streaming with ellipsis pulse animation while actively receiving deltas — 3 tests; ToolCallCard progress sweep shimmer for active states (Invoking/Streaming), green flash transition to Completed, red flash to Failed, live duration counter — 7 tests; TurnCard view controls — compact mode (~60% height reduction), font size via CSS variable, global thinking visibility toggle — 5 tests; SessionActionBar toolbar with Raw Terminal toggle (shell for Issue #11 xterm.js) and Export dropdown (Copy JSON/Markdown, Save to File) — 9 tests; streamingBatch performance utility coalesces rapid delta events into 16ms frame batches to prevent layout thrashing — 6 tests; ~226 lines CSS across all animations (@keyframes for live-pulse, cursor-blink, ellipsis-pulse, thinking-fade-in, progress-sweep, completed-flash, failed-flash); 42 new tests, 84 total execution-view tests, 14/14 acceptance criteria met

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
