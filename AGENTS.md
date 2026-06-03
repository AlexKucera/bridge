<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **bridge** (1724 symbols, 3154 relationships, 145 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/bridge/context` | Codebase overview, check index freshness |
| `gitnexus://repo/bridge/clusters` | All functional areas |
| `gitnexus://repo/bridge/processes` | All execution flows |
| `gitnexus://repo/bridge/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Session Logs

Session logs are written to `docs/devlog/` after each completed task, issue fix, or milestone. They capture what was done, decisions & rationale, gotchas & fixes, and next steps. Before starting a new session, read the previous session logs.

<!-- write-log: session-log-index -->

| Date | Type | File | Summary |
|------|------|------|---------|
| 2026-06-03 | generic | [20260603-launch-session-pipeline-and-window-fixes_log.md](docs/devlog/20260603-launch-session-pipeline-and-window-fixes_log.md) | **7 bugs fixed:** setVesselPath + Object DOM leak + pty_write null + window size/persist + wrong pi CLI flags + missing JSON stdout reader + event format mapper + Tauri v2 payload parse (×3). 159/159 Rust · tsc clean |
| 2026-06-03 | generic | [20260603-cargo-panel-bugfixes-tabbar-tests-and-ui-wiring_log.md](docs/devlog/20260603-cargo-panel-bugfixes-tabbar-tests-and-ui-wiring_log.md) | **Bug Fixes:** TabBar 15/15 tests ✅ + CargoPanel import fix + blank Cargo panel fix. tsc clean, 568/599 frontend |
|------|------|------|---------|
| 2026-06-03 | generic | [20260603-cargo-panel-bugfixes-tabbar-tests-and-ui-wiring_log.md](docs/devlog/20260603-cargo-panel-bugfixes-tabbar-tests-and-ui-wiring_log.md) | **Bug Fixes:** TabBar 15/15 tests ✅ + CargoPanel import fix + blank Cargo panel fix. tsc clean, 568/599 frontend |
| 2026-06-03 | slice | [20260603-slice-10-cargo-panel-and-git-operations-issue12_log.md](docs/devlog/20260603-slice-10-cargo-panel-and-git-operations-issue12_log.md) | **Issue #12 Complete (14/14 AC):** Cargo Panel — Rust cargo module (20 tests) + Tauri commands + TS types/store (19 tests) + 7 UI components + CSS. 159/159 Rust · 578+ frontend · **39 new cargo tests** |
| 2026-06-02 | generic | [20260602-vessel-click-launch-flow-wiring_log.md](docs/devlog/20260602-vessel-click-launch-flow-wiring_log.md) | **Vessel Click → Launch Flow Fixed:** LaunchDialog missing imports root cause + VesselDetailScreen full rewrite + test fixes. 540/558 frontend pass, tsc clean |
| 2026-06-02 | slice | [20260602-slice-9d-comms-deck-integration-ac7-classifier-issue11_log.md](docs/devlog/20260602-slice-9d-comms-deck-integration-ac7-classifier-issue11_log.md) | **Issue #11 Complete:** mod.rs structural fix + session_launch restore + 9 integration tests + LogLineClassifier (42 tests) for AC#7. 139/139 Rust · 539/550 frontend · **11/11 AC** |
| 2026-06-02 | slice | [20260602-slice-9c-comms-deck-tab-switching-issue11_log.md](docs/devlog/20260602-slice-9c-comms-deck-tab-switching-issue11_log.md) | **Tab Switching:** TabBar + TabStore + SessionViewContainer + badge counts + always-mounted state preservation. 33 new tests, 497/508 frontend pass
| 2026-06-02 | slice | [20260602-slice-9b-comms-deck-frontend-issue11_log.md](docs/devlog/20260602-slice-9b-comms-deck-frontend-issue11_log.md) | **PTY Frontend:** xterm.js + PtyStore + CommsDeckPanel + ScanLineOverlay + scan-line CSS + event wiring. 27 new tests, 464/475 frontend pass |
| 2026-06-02 | slice | [20260602-slice-9-comms-deck-pty-backend-issue11_log.md](docs/devlog/20260602-slice-9-comms-deck-pty-backend-issue11_log.md) | **PTY Backend:** PtySession + spawn/write/read/resize + SessionProcess enum + pty_write/pty_resize commands + output reader. 12 new tests, 121/121 Rust pass
| 2026-06-01 | slice | [20260601-slice-8-execution-view-animations-and-controls-issue10_log.md](docs/devlog/20260601-slice-8-execution-view-animations-and-controls-issue10_log.md) | **Streaming animations & UX polish:** LiveIndicator + ResponseText cursor + ThinkingBubble stream + ToolCallCard sweep/flash + compact/font/thinking toggles + SessionActionBar + streamingBatch perf guard. 14/14 AC met, 84 execution-view tests |
| 2026-06-01 | slice | [20260601-slice-7-execution-view-tdd-ac-gap-fixes-issue9_log.md](docs/devlog/20260601-slice-7-execution-view-tdd-ac-gap-fixes-issue9_log.md) | **AC gap fixes (TDD):** unknown events + auto-scroll + virtualization + animation test. 14/14 AC met, 106 execution-view tests |
| 2026-06-01 | slice | [20260601-slice-7-execution-view-ac-gap-fixes-issue9_log.md](docs/devlog/20260601-slice-7-execution-view-ac-gap-fixes-issue9_log.md) | **AC gap fixes:** Tauri events (9 tests) + TruncatedText (8 tests) + sessionId filter (3 tests). 14/14 AC met, 79 tests |
| 2026-06-01 | slice | [20260601-slice-7-execution-view-issue9_log.md](docs/devlog/20260601-slice-7-execution-view-issue9_log.md) | Execution View: types + pi-store + 8 components + CSS. 67 new tests, 12/14 AC met |
| 2026-05-29 | slice | [20260529-slice-5-pi-event-pipeline-parser-and-state-machine-issue7_log.md](docs/devlog/20260529-slice-5-pi-event-pipeline-parser-and-state-machine-issue7_log.md) | Pi event parser + state machine reducer. 13/13 AC met, 74 tests |
| 2026-05-29 | issue | [20260529-fix-settings-screen-state-and-config-persistence_issue6_log.md](docs/devlog/20260529-fix-settings-screen-state-and-config-persistence_issue6_log.md) | Fixed SettingsScreen reactive state + config persistence (29 tests) |
| 2026-05-29 | slice | [20260529-slice-4-helm-settings-and-config-resolution-issue6_log.md](docs/devlog/20260529-slice-4-helm-settings-and-config-resolution-issue6_log.md) | Rust config module + SettingsScreen UI + 4 Tauri commands (321 total tests) |
| 2026-05-29 | slice | [20260529-slice-4-helm-settings-and-config-resolution-issue6_log.md](docs/devlog/20260529-slice-4-helm-settings-and-config-resolution-issue6_log.md) | Rust config module + SettingsScreen UI + 4 Tauri commands (321 total tests) |
| 2026-05-26 | generic | [20260526-fix-tokio-runtime-panic-in-setup_log.md](docs/devlog/20260526-fix-tokio-runtime-panic-in-setup_log.md) | Fixed startup panic: Runtime::new() vs Handle::current() |
| 2026-05-26 | slice | [20260526-slice-3-sqlite-data-layer-and-fleet-management-issue5_log.md](docs/devlog/20260526-slice-3-sqlite-data-layer-and-fleet-management-issue5_log.md) | SQLite data layer + vessel CRUD + Fleet UI (287 total tests) |
| 2026-05-23 | issue | [20260523-fix-blank-window-after-issue4-chrome-implementation_issue4_log.md](docs/devlog/20260523-fix-blank-window-after-issue4-chrome-implementation_issue4_log.md) | Fixed blank window: Navigate context + grid + scroll containment (264 tests) |
| 2026-05-22 | slice | [20260522-slice-2-component-extraction-and-tdd-test-suite-issue3_log.md](docs/devlog/20260522-slice-2-component-extraction-and-tdd-test-suite-issue3_log.md) | BottomNavBar + keyboard shortcuts + WelcomeScreen + OverlayLayout (264 total) |