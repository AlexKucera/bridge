# Slice 3: SQLite Data Layer & Fleet Management

> **Date:** 2026-05-26
> **Type:** slice
> **Reference:** Issue #5 — [Slice 3: SQLite Data Layer & Fleet Management](https://github.com/AlexKucera/bridge/issues/5)

## Goal

Build the persistent data layer (SQLite + migrations) and the vessel CRUD system (Fleet), plus the Fleet Dashboard UI shell with 3-column layout, VesselCard components, AddVesselDialog, and context menu support.

## What Was Done

### Stream A — SQLite Data Layer (3 new Rust tests)

- **`src-tauri/migrations/20260526000001_initial_schema.sql`** — Migration creating all 7 tables: `vessels`, `vessel_configs`, `bridge_config`, `sessions`, `quick_prompts`, `log_events` (with 4 indexes), `appearance_prefs`
- **`src-tauri/src/db/mod.rs`** — Database module with `migrate()` (runs sqlx migrations) and `open_database()` (creates/opens SQLite file). Uses `sqlite::memory:` connection string for test pools (key discovery — `:memory:` with SqliteConnectOptions doesn't share DB across pool connections)
- **`src-tauri/src/lib.rs`** — Wired DB initialization into Tauri setup: resolves app data dir, opens `bridge.db`, runs migrations, stores pool via `app.manage(pool)`
- **`Cargo.toml`** — Added `migrate` feature to sqlx, `thiserror` dependency, `tempfile` dev-dependency

### Stream B — Rust Vessel Module (12 Rust tests)

- **`src-tauri/src/vessel/mod.rs`** — Full vessel CRUD module:
  - `Vessel` struct with `sqlx::FromRow` derive (required for query_as mapping)
  - `VesselGitInfo` / `VesselWithGit` for enriched records
  - `add_vessel()` — validates path exists, is dir, has `.git`, rejects duplicates; extracts name from dirname
  - `list_vessels()` — returns all vessels sorted by name ASC
  - `list_vessels_with_git()` — enriches each vessel with git branch (`git branch --show-current`) and dirty state (`git status --porcelain`)
  - `get_vessel()` / `rename_vessel()` / `remove_vessel()` — with cascade delete (vessel_configs → quick_prompts → log_events → NULL sessions → vessel)
  - `VesselError` enum with `serde::Serialize` (required by Tauri v2 command error handling)
  - 12 tests covering: store, reject non-dir, reject non-git, reject duplicate, list sorted, get by id, get missing, rename, remove+cascade, remove missing, git metadata resolution
- **`src-tauri/src/commands.rs`** — 6 Tauri commands: `vessel_add`, `vessel_list`, `vessel_list_with_git`, `vessel_get`, `vessel_rename`, `vessel_remove`
- **`src-tauri/src/lib.rs`** — Registered all 6 commands in `invoke_handler`

### Stream C — Fleet Dashboard UI (8 new frontend test files, +7 tests)

- **`src/screens/FleetDashboard.tsx`** — Replaced placeholder with 3-column CSS grid layout: `180px sidebar | 1fr content | 280px feed`. Sidebar shows "Vessels" header, content area shows empty-state, feed panel is placeholder
- **`src/components/VesselCard.tsx`** — Card component with: status dot (4 colors), display name, branch name, dirty indicator (●), selection highlight (background + border-left accent bar). Grid: `24px | 1fr auto`. Fires `onClick` and `onContextMenu` callbacks
- **`src/components/AddVesselDialog.tsx`** — Modal dialog with: repository path input + native "Browse…" button (calls `__TAURI__.dialog.open`), auto-filled display name from directory name, validation error display, Cancel / Add Vessel buttons
- **`src/tests/fleet.test.tsx`** — 2 tests: 3-column structure, CSS grid usage
- **`src/tests/vesselcard.test.tsx`** — 7 tests: name rendering, status dot, branch, dirty on/off, selected state, accent bar via border-left
- **`src/tests/add-vessel-dialog.test.tsx`** — 4 tests: dialog elements render, display name field, closed when not open, onClose callback
- **`src/tests/vessel-context-menu.test.tsx`** — 2 tests: contextmenu fires on right-click, doesn't fire on left-click
- **`src/tests/router.test.tsx`** — Updated FleetDashboard test to match new subtitle text ("Monitor all vessels")

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| sqlx migrate (file-based) over manual CREATE TABLE | Compile-time checking via `sqlx prepare`, standard tooling (`sqlx migrate add`), idempotent via `_sqlx_migrations` tracking table |
| `sqlite::memory:` connection string over `SqliteConnectOptions::filename(":memory:")` | The URL form shares a single in-memory database across all connections in the pool; the options form creates a separate DB per connection, causing migration visibility issues |
| `sqlx::FromRow` derive on `Vessel` struct | Enables clean `query_as::<Vessel>()` calls without manual tuple destructuring. Required because sqlx 0.8 doesn't implement `FromRow` for arbitrary structs without the derive macro |
| `serde::Serialize` on `VesselError` | Tauri v2 requires command error types to implement `Serialize` for IPC response serialization |
| Inline styles on UI components over CSS class file | Keeps components self-contained for this prototype phase; design tokens referenced via CSS variables (`var(--bg)`, etc.) for theme consistency |
| Git metadata via `std::process::Command` ("git") over libgit2 | Zero dependencies, works with any git installation, simple output parsing. Can swap to libgit2 if performance becomes a concern |
| Cascade delete explicit in `remove_vessel()` | Foreign keys handle some cascades (ON DELETE CASCADE), but sessions uses ON DELETE SET NULL, so we explicitly clean up all dependent tables in correct order |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| Migration "succeeds" but no tables created | Using `SqliteConnectOptions::filename(":memory:")` creates a separate DB per connection; the migrator writes to one connection, test reads from another | Switch to `Pool::connect("sqlite::memory:")` URL form which shares a single in-memory DB across the pool |
| `Migrator::new()` compile error (no `.run()` method) | sqlx 0.8 made `Migrator::new()` async (returns `impl Future`) unlike 0.7 which was synchronous | Add `.await?` after `Migrator::new(...)` |
| `edit` tool creating duplicate lines | The `replace` op's replacement text ending matches the next surviving line's start, causing the merge to keep both lines | Use `sed -i '' '<line>d'` for single-line deletions, or rewrite entire file when edits cascade |
| `Vessel` struct missing fields after sed correction | `sed -i '' '26d'` deleted line 26 which was `pub id: i64,\` (the field), not the duplicate `pub struct Vessel {` that was intended | Rewrote entire vessel/mod.rs from scratch to recover clean state |
| CSS-in-JS syntax error `"min-width": 0` | Unquoted numeric value inside a quoted-key string object broke the TSX parser | Quote all values: `"min-width": "0"` or use camelCase `minWidth: "0"` |
| `getByText(/add vessel/i)` matching multiple elements | Both `<h2>` heading and submit button contain "Add Vessel" text | Use `getByRole("button", { name: /add vessel/i })` for role-specific matching |
| Router test failing after FleetDashboard update | Test expected old placeholder text `/Fleet overview coming/i` that was replaced | Updated router test to match new subtitle `/Monitor all vessels/i` |
| `container.querySelector()` returning null | SolidJS testing library's `container` may have different scope than `document` | Switched all queries to use `document.querySelector()` matching project convention from overlay.test.tsx |

## Files Changed

| File | Change Summary |
|------|---------------|
| `src-tauri/migrations/20260526000001_initial_schema.sql` | **NEW** — 7-table migration schema with indexes |
| `src-tauri/src/db/mod.rs` | **NEW** — DB pool creation, migration runner, 3 tests |
| `src-tauri/src/vessel/mod.rs` | **NEW** — Vessel CRUD logic, git metadata, 12 tests |
| `src-tauri/src/commands.rs` | **NEW** — 6 Tauri command handlers |
| `src-tauri/src/lib.rs` | **MODIFIED** — DB init at startup, command registration |
| `src-tauri/Cargo.toml` | **MODIFIED** — Added sqlx/migrate, thiserror, tempfile deps |
| `src/screens/FleetDashboard.tsx` | **MODIFIED** — 3-column grid layout replacing placeholder |
| `src/components/VesselCard.tsx` | **NEW** — Vessel card with status/branch/dirty/selection |
| `src/components/AddVesselDialog.tsx` | **NEW** — Modal dialog with path input, browse, validation |
| `src/tests/fleet.test.tsx` | **NEW** — 2 layout structure tests |
| `src/tests/vesselcard.test.tsx` | **NEW** — 7 VesselCard rendering tests |
| `src/tests/add-vessel-dialog.test.tsx` | **NEW** — 4 dialog interaction tests |
| `src/tests/vessel-context-menu.test.tsx` | **NEW** — 2 context menu event tests |
| `src/tests/router.test.tsx` | **MODIFIED** — Updated FleetDashboard assertion |

## Open Items & Next Steps

- [ ] **Wire frontend to Tauri commands** — Create JS/TS invoke wrappers (`import { invoke } from "@tauri-apps/api/core"`) and connect FleetDashboard → vessel_list_with_git, AddVesselDialog → vessel_add, context menu → vessel_rename/vessel_remove
- [ ] **VesselSidebar component** — Extract sidebar section from FleetDashboard into its own component that maps vessel list to VesselCard list, handles selection state
- [ ] **ActivityFeedPanel implementation** — Slice 12 placeholder; right now just shows "coming soon"
- [ ] **CSS extraction** — Move inline styles from VesselCard, AddVesselDialog, FleetDashboard to `bridge.css` with CSS custom properties for theming consistency
- [ ] **Git metadata caching** — `resolve_git_info()` spawns a git process per vessel per call; consider caching or batch resolution for large fleets
- [ ] **Tauri capabilities** — Add `dialog: default` permission to `src-tauri/capabilities/default.json` for the native directory picker to work at runtime

---

*Test counts: 15 Rust tests (up from 0), 272 frontend assertions (up from 264). Total: 287.*
