# Slice 6 Progress — Issue #8 (Session Lifecycle Management)

## Overview
Implementing Issue #2: Session Lifecycle Management (Rust backend) + Launch Dialog UI.
Following strict TDD methodology (RED→GREEN one test at a time).

## Status: 🔄 Task 3 of 5 COMPLETE — Moving to Task 4 (Events Module)

---

## Task 3: Stop / Retry / Concurrency Limiting ✅ COMPLETE

### Cycles 25-26: SessionRegistry
- **Cycle 25**: `session_registry_starts_empty` — count=0, get returns None
- **Cycle 26**: `session_registry_insert_and_get_roundtrip` — insert child process, verify roundtrip

### Cycles 27-28: stop()
- **Cycle 27**: `stop_sends_sigterm_and_updates_status_to_stopped` — full lifecycle: spawn sleep, register, stop, verify DB status="Stopped" + completed_at set
- **Cycle 28**: `stop_returns_not_found_for_unknown_session` — error propagation

### Cycles 29-30: retry()
- **Cycle 29**: `retry_clones_session_data_and_creates_new_record` — clones prompt/mode/model/provider, creates new DB record with higher ID
- **Note**: Fixed bug where `LaunchOverrides` lacked `provider` field — added it + updated `resolve_config()` precedence chain

### Cycles 31-33: Concurrency Limiting
- **Cycle 31**: `at_capacity_error_shows_current_and_max` — error display format
- **Cycle 32**: `launch_rejects_when_registry_at_capacity` — max=0 rejects even with 0 active
- **Cycle 33**: `launch_succeeds_when_under_capacity_limit` — max=1 with 0 active passes concurrency check

### Tauri Commands Added (5)
| Command | Purpose |
|---------|---------|
| `session_launch` | Launch new Pi session (mode, prompt, vessel, overrides) |
| `session_stop` | Stop running session (SIGTERM + 5s grace) |
| `session_retry` | Clone config from completed session and relaunch |
| `session_list` | List all sessions (DESC by started_at) |
| `session_get` | Get single session by ID |

### lib.rs Changes
- `app.manage(SessionRegistry::new())` — shared state across commands
- 5 new commands in invoke_handler

### Bug Fix: LaunchOverrides missing `provider`
- Added `provider: Option<String>` to `LaunchOverrides`
- Updated `resolve_config()` precedence: launch override > vessel > global
- Required for retry() to preserve provider from original session

---

## Test Counts (Cumulative)

| Module | Tests | Cumulative |
|--------|-------|------------|
| config | 16 | 16 |
| db | 3 | 19 |
| vessel | 13 | 32 |
| pi_event | 23 | 55 |
| pi_state | 19 | 74 |
| pi_session | 34 | **108** |

**Total: 108 tests passing** ✅

---

## Previous Tasks (Complete)

### Task 1: Session Record + Pre-flight Check ✅
- Session struct, SessionMode enum, CRUD functions, preflight_check, build_launch_command, resolve_for_launch
- 23 tests

### Task 2: Launch + Stdout Pipeline ✅
- launch() with full lifecycle (config resolve → preflight → DB record → spawn → register)
- read_stdout_loop() with JSONL parsing integration
- 5 tests (launch_creates_session_record, read_stdout_loop x3, resolve_for_launch x2)

---

## Remaining Tasks

### Task 4: Events Module (Throttled Emitter) — NEXT
- Per-channel subscribers: execution-update, captains-log-event, activity-feed-event, engine-room-update
- Batch interval config (50ms default)
- Max rate cap (60 events/sec default)

### Task 5: Launch Dialog UI (SolidJS)
- Modal dialog with: prompt textarea, vessel selector, mode toggle, overrides panel, validation

---

## Key Decisions & Rationale

### SessionRegistry Design
- **RwLock<HashMap>** over tokio::sync::Mutex for better read concurrency
- `take()` removes from registry (ownership transfer to caller who manages Child lifecycle)
- `count_active()` is O(1) on HashMap len

### stop() Grace Period
- Default 5 seconds (configurable via parameter)
- SIGTERM sent first, then wait with timeout
- If timeout expires, process may still be running (OS cleanup handles it)

### retry() Strategy
- Reads original session record from DB
- Constructs LaunchOverrides from original's prompt/mode/model/provider
- Delegates to launch() for full lifecycle (ensures consistency)
- New session gets fresh ID, original remains in DB as historical record
