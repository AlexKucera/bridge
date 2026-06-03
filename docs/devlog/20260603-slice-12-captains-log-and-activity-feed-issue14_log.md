# Slice 12: Captain's Log & Activity Feed (Issue #14)

> **Date:** 2026-06-03
> **Type:** slice
> **Reference:** [Issue #14](https://github.com/AlexKucera/bridge/issues/14)

## Goal

Build the Captain's Log (fleet-wide event timeline) and Activity Feed (real-time dashboard panel). Two views of the same event data: one for deep exploration, one for ambient awareness. Full-stack: Rust backend module → Tauri commands → TS types → SolidJS store → UI components + CSS.

## What Was Done

### Rust Backend (`src-tauri/src/log/mod.rs`) — 16 tests

- **`LogEventType` enum**: Run, Ship, Warn, Error, Crew with `from_str`/`as_str` converters
- **`LogEntry` struct**: id, vessel_id, vessel_name (resolved via JOIN), event_type, message, metadata (JSON), pinned, created_at
- **`LogQueryFilter`**: time_range (seconds from now), types (multi-select AND), pinned_only, vessel_id, search_text (LIKE across message + vessel_name)
- **`log_event()`**: Insert with type validation, JSON metadata serialization, vessel_name resolution via `COALESCE(display_name, name)`
- **`query_logs()`**: Dynamic SQL builder with LEFT JOIN to vessels table. `ORDER BY pinned DESC, created_at DESC`. All 6 filter dimensions composable.
- **`pin_log_entry()` / `unpin_log_entry()`**: Update with rows_affected check → `NotFound` error
- **Internal `LogEntryRaw`** struct with `#[derive(FromRow)]` for clean DB mapping, converted to public `LogEntry` via `.to_entry()`

### Tauri Commands (`src-tauri/src/commands.rs`)

- `log_event`, `query_logs`, `pin_log_entry`, `unpin_log_entry` — all return `Result<T, String>` for Tauri 2 compatibility
- `cargo_commit` / `cargo_push` enhanced with pool access for auto-emission
- Helper `resolve_vessel_id_for_path()` for path→vessel_id lookup

### Session Lifecycle Auto-Emission (`src-tauri/src/pi_session/mod.rs`)

- `session_launch()` → emits `"Run"` event after session creation
- `finalize_session()` → emits `"Run"` on success, `"Error"` on failure (with duration/tokens in message)
- `cargo_commit` command → emits `"Ship"` with commit hash
- `cargo_push` command → emits `"Ship"` with success status

### Frontend Types (`src/lib/log-types.ts`)

- `LogEntry`, `LogQueryFilter`, `LogEventType` interfaces
- `EVENT_TYPE_COLORS` map (Run=blue, Ship=green, Warn=amber, Error=red, Crew=purple)
- `EVENT_TYPE_ICONS` map (▶, ⚓, ⚠, ✕, 👥)

### Log Store (`src/store/log-store.ts`) — 8 tests

- SolidJS reactive store with `createSignal` pattern (matches cargo-store, pty-store)
- Actions: `fetchLogs`, `setFilter`, `resetFilter`, `pinEntry`, `unpinEntry`, `refresh`
- Derived: `pinnedCount()`
- Error handling with string conversion from Tauri invokes

### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| `LogFilters` | `components/LogFilters.tsx` | Time range pills (1h/24h/7d/30d), type multi-select pills, 📌 pinned toggle with count |
| `LogEventRow` | `components/LogEventRow.tsx` | Time (HH:MM), color-coded icon, message + vessel link, pin/copy/open/expand actions |
| `LogTimeline` | `components/LogTimeline.tsx` | Day-grouped entries with sticky headers ("Today", "Yesterday", "Wednesday…"), empty state |
| `LogSearch` | `components/LogSearch.tsx` | Search input with 🔍 icon, ⌘F keyboard shortcut, 200ms debounce, clear button |
| `ActivityFeedPanel` | `components/ActivityFeedPanel.tsx` | 280px right-column panel, real-time Tauri event subscription, last 50 events, "View full log" link |
| `FeedItem` | `components/ActivityFeedPanel.tsx` | Type-colored icon, truncated message (~80 chars), relative timestamp, vessel name |
| `CaptainsLogScreen` | `screens/CaptainsLogScreen.tsx` | Full screen wiring LogSearch + LogFilters + LogTimeline with OverlayLayout nav |

### CSS (`src/bridge.css`) — ~350 lines

- `.log-pill.active` glow-state with per-type colors and `box-shadow`
- `.log-event-row` grid layout (48px time | 28px icon | 1fr message | auto actions)
- `.log-day-header` sticky positioning
- `.activity-feed-panel` fixed 280px width
- `.feed-item` compact layout with meta row
- Empty state illustrations for both log and feed

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Internal `LogEntryRaw` + public `LogEntry` separation | `vessel_name` isn't a real column; need JOIN resolution. Keeps public API clean while using sqlx::FromRow for DB mapping |
| Dynamic SQL for `query_logs` instead of multiple query functions | 6 filter dimensions × combinations = dozens of static queries. Dynamic WHERE clause is simpler and more maintainable |
| `COALESCE(display_name, name)` for vessel_name | Users see their friendly display_name when set, falls back to directory name |
| `Result<T, String>` return on Tauri commands | `sqlx::Error` inside `LogError::Db` doesn't serialize cleanly for Tauri 2's `#[tauri::command]`. Matches existing pattern from `cargo_generate_message` |
| Session lifecycle uses `let _ = log_event(...)` pattern | Log failures must never block primary operations (session launch, commit, etc.) |
| Per-entry vessel_name batch resolution in query_logs | N+1 queries but simple; acceptable for typical log sizes (<10K entries) |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| `mod log` shadows `log` crate → `LevelFilter` not found | New module named `log` conflicts with Rust `log` crate | Use `::log::LevelFilter` for explicit crate reference |
| `ParsedToolCall` not found in test scope | Pre-existing missing import in `pi_state` test module | Added `ParsedToolCall` to imports |
| `row.get::<T>()` compilation error (E0107) | sqlx 0.8 requires two generic args or different API | Switched to `LogEntryRaw` with `#[derive(FromRow)]` pattern matching existing codebase |
| Tests placed inside `impl` blocks instead of `tests` module | `replace` matched first `}\n}` which was inside impl, not at end of tests module | Used unique anchor strings from test content for replace targets |
| Time range SQL syntax error (`near ")"`) | Extra `)` in COALESCE LIKE clause: `COALESCE(v.display_name, '')) LIKE ?` | Fixed to single `)` |
| Pinned entries not sorting above unpinned | Missing `pinned DESC` in ORDER BY | Changed to `ORDER BY le.pinned DESC, le.created_at DESC` |
| datetime SQL binding issue (0 results for 30-day range) | `? \|\| 'seconds'` produced `-2592000seconds` without space | Fixed to `? \|\| ' seconds'` (leading space in bound format) |
| Unclosed delimiter in commands.rs at line 587 | `resolve_vessel_id_for_path` function body lost its declaration during replace operation | Added back `fn` declaration and closing brace |

## Files Changed

| File | Change Summary |
|------|---------------|
| `src-tauri/src/log/mod.rs` | **NEW** — Full log module: types, errors, operations, 16 tests |
| `src-tauri/src/lib.rs` | Added `mod log`, `::log::LevelFilter` fix, 4 new command registrations |
| `src-tauri/src/commands.rs` | 4 log commands, enhanced cargo_commit/push with pool + auto-emit, resolve helper |
| `src-tauri/src/pi_session/mod.rs` | Auto-emit log_event in session_launch + finalize_session |
| `src-tauri/src/pi_state/mod.rs` | Fixed pre-existing: added `ParsedToolCall` import |
| `src/lib/log-types.ts` | **NEW** — TS types, color/icon maps |
| `src/store/log-store.ts` | **NEW** — SolidJS reactive store |
| `src/components/LogFilters.tsx` | **NEW** — Filter bar component |
| `src/components/LogEventRow.tsx` | **NEW** — Event row component |
| `src/components/LogTimeline.tsx` | **NEW** — Day-grouped timeline |
| `src/components/LogSearch.tsx` | **NEW** — Search with ⌘F |
| `src/components/ActivityFeedPanel.tsx` | **NEW** — Feed panel + FeedItem |
| `src/screens/CaptainsLogScreen.tsx` | Rewritten — From stub to full implementation |
| `src/bridge.css` | ~350 lines of CSS for all log/feed components |
| `src/tests/log-store.test.ts` | **NEW** — 8 store tests |
| `src/tests/captains-log.test.tsx` | **NEW** — 11 UI component tests |

## Open Items & Next Steps

- [ ] Wire `ActivityFeedPanel` into `FleetDashboard` layout (right column integration)
- [ ] Add toast notification system for copy-to-clipboard feedback
- [ ] Consider adding partial index on `log_events(pinned)` for `WHERE pinned=1` queries
- [ ] Add migration for `log_events` partial index if performance needed at scale
- [ ] Test real-time `activity-feed-event` emission from backend (Rust-side `app.emit_all`)
- [ ] Pre-existing frontend test failures (32 failures in 7 files) remain unfixed — not introduced by this slice

---
*Log written by write-log skill*
