# 2026-05-29 Slice 6 Task 3 — Stop / Retry / Concurrency Limiting

## Summary
Completed Task 3 of 5 for Issue #8 (Session Lifecycle Management): implemented SessionRegistry, stop(), retry(), concurrency limiting, and 5 Tauri commands. Fixed a bug where LaunchOverrides was missing the `provider` field. All **108 tests pass**.

## What Was Done

### SessionRegistry (Cycles 25-26)
- In-memory process tracker using `tokio::sync::RwLock<HashMap<i64, RunningSession>>`
- Operations: `insert()`, `get()` → `SessionMeta`, `take()` (ownership transfer), `remove()`, `count_active()`
- Design choice: RwLock over Mutex for better read concurrency (multiple status checks without blocking)

### stop() (Cycles 27-28)
- Full lifecycle: take from registry → update DB to "Stopping" → SIGTERM → wait with grace period timeout → update DB to "Stopped" + set completed_at
- Default grace period: 5 seconds (configurable)
- Returns updated Session record on success
- NotFound error for unknown sessions

### retry() (Cycles 29-30)
- Reads original session from DB
- Constructs LaunchOverrides from original's prompt, mode, model, provider
- Delegates to launch() for full lifecycle (config resolve → preflight → DB record → spawn)
- New session gets fresh auto-increment ID; original preserved as historical record
- Re-registers in SessionRegistry so caller can track it

### Concurrency Limiting (Cycles 31-33)
- `launch()` checks `registry.count_active()` against `max_concurrency` before spawning
- Returns `SessionError::AtCapacity { current, max }` when at limit
- Max concurrency from global config (`max_concurrency` field, default 2)
- Tests verify: error format, rejection at capacity, success under limit

### Tauri Commands (5 new)
| Command | Parameters | Returns |
|---------|-----------|---------|
| `session_launch` | vessel_id?, mode, prompt, overrides_json | Session |
| `session_stop` | session_id | Session (updated) |
| `session_retry` | session_id | Session (new) |
| `session_list` | (none) | Vec<Session> |
| `session_get` | session_id | Session |

### lib.rs Registration
- `app.manage(SessionRegistry::new())` in setup closure
- All 5 commands added to invoke_handler

## Bug Fix: LaunchOverrides Missing Provider

**Problem**: `retry()` test failed because `LaunchOverrides` had no `provider` field. The resolved config always fell back to global default ("anthropic") instead of preserving the original session's provider ("openai").

**Fix**:
1. Added `provider: Option<String>` to `LaunchOverrides` struct
2. Updated `resolve_config()` precedence chain: `overrides.provider > vessel.provider > global.default_provider`
3. Updated `retry()` to pass `original.provider.clone()` into overrides

## Test Results
```
cargo test: 108 passed (3 suites, 0.68s)
```

Breakdown:
- config: 16 tests
- db: 3 tests  
- vessel: 13 tests
- pi_event: 23 tests
- pi_state: 19 tests
- pi_session: 34 tests (+8 new this task)

## Files Changed
- `src-tauri/src/pi_session/mod.rs` — SessionRegistry, stop(), retry(), concurrency checks, 8 new tests
- `src-tauri/src/commands.rs` — 5 new Tauri commands (session_launch/stop/retry/list/get)
- `src-tauri/src/lib.rs` — SessionRegistry management + command registration
- `src-tauri/src/config/mod.rs` — Added `provider` to LaunchOverrides + updated resolve precedence

## Gotchas & Lessons Learned
1. **File corruption via cat >>**: Appending to Rust source files with shell heredocs is risky if the file already has trailing content. Use `write` tool for full file rewrites instead.
2. **concat!() macro limitation**: Only accepts literal string arguments, not variables. Had to expand loop into individual `include_str!()` calls.
3. **Use-after-move in async**: When inserting a value into a registry and then needing its field, save the field before the insert.
4. **LaunchOverrides scope creep**: Adding `provider` felt like scope expansion but was necessary for correct retry behavior. The alternative (directly setting provider on PiLaunchConfig) would bypass the resolution chain.

## Next Steps
- **Task 4**: Events Module (throttled emitter with per-channel subscribers, batch interval, rate cap)
- **Task 5**: Launch Dialog UI (SolidJS component)
