# Launch Session Pipeline & Window Fixes

> **Date:** 2026-06-03
> **Type:** generic
> **Reference:** User-reported runtime errors during session launch

## Goal

Fix a cascade of bugs that prevented launched sessions from showing activity in the UI, plus window sizing issues. The user reported that launching a session appeared to succeed but the Structured tab stayed at "No activity yet."

## What Was Done

### Bug 1: `setVesselPath is not a function`
- **File:** [`src/store/cargo-store.ts`](src/store/cargo-store.ts)
- **Fix:** Added `setVesselPath(path: string)` to the `CargoStore` interface (line 37) and exported it from the factory object (line 155). The private signal setter was never exposed on the public interface.

### Bug 2: "Unrecognized value. Skipped inserting – Object" DOM warning
- **File:** [`src/components/LaunchDialog.tsx`](src/components/LaunchDialog.tsx)
- **Root cause:** Rust `session_launch` command returns `Result<Session, String>` — a full session object with `{ id, mode, model, prompt, provider, status, tokensUsed, ... }`. But line 67 typed it as `invoke<number>`. The entire session object leaked into state and was rendered as text.
- **Fix:** Added [`LaunchedSession`](src/components/LaunchDialog.tsx:49) interface matching the Rust `Session` struct. Changed `invoke<number>` → `invoke<LaunchedSession>`. Extract numeric ID via `session.id`. Updated callback signature to `(sessionId: number, mode: string)`.

### Bug 3: `pty_write failed: invalid type null, expected i64`
- **Files:** [`src/screens/VesselDetailScreen.tsx`](src/screens/VesselDetailScreen.tsx), [`src/components/LaunchDialog.tsx`](src/components/LaunchDialog.tsx), [`src/components/terminal/CommsDeckPanel.tsx`](src/components/terminal/CommsDeckPanel.tsx)
- **Root cause:** Launching in "json" mode creates a Pi session with no PTY process, but `createTabStore({ defaultMode: "pty" })` always defaulted to Terminal tab → CommsDeckPanel mounted unconditionally → tried `pty_write` with invalid sessionId.
- **Fix:**
  - LaunchDialog now passes `(sessionId, mode)` through callback
  - VesselDetailScreen sets default tab to `"structured"` when mode is json, only connects PTY store when `mode === "pty"`
  - Added defensive guard in CommsDeckPanel's keydown handler for invalid sessionId

### Bug 4: Window too small + doesn't remember size
- **Files:** [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json), [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml), [`src-tauri/src/lib.rs`](src-tauri/src/lib.rs)
- **Fix:** Default window 800×600 → **1280×800** with `"center": true`. Added `tauri-plugin-window-state = "2"` dependency and registered it in `lib.rs` setup — automatically persists/restores window size, position, and maximized state across launches.

### Bug 5: Nothing happens after launch — three sub-bugs

#### 5a. Wrong CLI flags in `build_launch_command`
- **File:** [`src-tauri/src/pi_session/mod.rs`](src-tauri/src/pi_session/mod.rs:192)
- **Root cause:** Command was built as `pi chat --output-format json --session-dir ... "prompt"` but pi CLI v0.78.0 uses:
  - `--mode json` (not `--output-format json`)
  - No `chat` subcommand (doesn't exist)
  - `--print` required for non-interactive/piped stdout
- **Fix:** Removed bogus `"chat"` subcommand, changed to `--mode json`, added `--print` flag, guarded empty prompt.

#### 5b. No stdout reader for JSON-mode sessions
- **File:** [`src-tauri/src/pi_session/mod.rs`](src-tauri/src/pi_session/mod.rs:342), [`src-tauri/src/commands.rs`](src-tauri/src/commands.rs:212)
- **Root cause:** PTY branch had full output loop (`PtyOutputLoop` → Tauri events). JSON mode spawned child with piped stdout but nobody read it. `read_stdout_loop()` existed but was never called.
- **Fix:** Added `take_child()` method to `RunningSession` (mirror of `take_pty()`). In `session_launch`, added `else if SessionMode::Json` branch that spawns a tokio task reading stdout line-by-line.

#### 5c. Event format mismatch (pi CLI → Frontend)
- **File:** [`src-tauri/src/commands.rs`](src-tauri/src/commands.rs:161)
- **Root cause:** pi CLI emits events like `{ type: "turn_start" }`, `{ type: "text_delta" }`, `{ type: "tool_use_start" }` but frontend's `applyEvent()` expects `{ type: "new_turn" }`, `{ type: "textDelta" }`, `{ type: "new_tool_call" }`.
- **Fix:** Added 100-line **pi JSONL → ExecutionUpdateEvent mapper** (`map_pi_event`) with 12 event type mappings plus `extract_text_content` helper:

| pi CLI event | Frontend event |
|---|---|
| `session` | `status_changed(Running)` |
| `agent_start` | `status_changed(Thinking)` |
| `turn_start` | `new_turn` |
| `message_start` (role=user) | `new_turn(role="user", promptText=...)` |
| `message_start` (role=assistant) | `status_changed(Running)` |
| `text_delta` / `content_block_delta` | `textDelta` |
| `thinking_delta` | `thinkingDelta` |
| `tool_use_start` / `tool_call_start` | `new_tool_call(Running)` |
| `tool_use_end` / `tool_result` | `tool_call_updated(Completed)` |
| `message_end` / `turn_end` | `turn_updated` |
| `session_end` / `done` | `status_changed(Done)` |
| `*` (unknown) | `unknown_event(raw=...)` |

### Bug 6: PiExecutionPanel JSON parse error
- **File:** [`src/components/execution/PiExecutionPanel.tsx`](src/components/execution/PiExecutionPanel.tsx:33)
- **Root cause:** Tauri v2 delivers `event.payload` as a JavaScript **object**, not a JSON string. `JSON.parse(object)` coerces to `"[object Object]"` → `SyntaxError: Unexpected identifier "object"`.
- **Fix:** Added typeof guard: `typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload`

### Bug 7: CommsDeckPanel pty-output JSON parse error (same root cause as #6)
- **File:** [`src/components/terminal/CommsDeckPanel.tsx`](src/components/terminal/CommsDeckPanel.tsx:120)
- **Fix:** Same typeof guard pattern applied to both pty-output and pty-exit handlers.

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Event translation in Rust, not frontend | Keeps frontend thin; avoids shipping a mapping layer to the client. Centralized translation means one place to update when pi CLI event schema changes. |
| `--print` flag for JSON mode | Without it, pi launches interactive TUI which writes ANSI escape codes to stdout — not parseable JSONL. `--print` forces non-interactive mode suitable for piped output. |
| `take_child()` pattern mirrors `take_pty()` | Consistent API design. Both extract ownership from `RunningSession.process` enum, leaving it in `Taken` state to prevent double-use. |
| Pass mode through LaunchDialog callback | Avoids coupling VesselDetailScreen to LaunchDialog internals. Mode flows naturally: user selects → dialog knows → callback carries → screen configures stores. |
| Defensive sessionId guard in CommsDeckPanel | Even with correct tab defaults, race conditions or manual tab switching could trigger writes before PTY connects. Guard prevents cryptic Rust errors from reaching user. |
| `window-state` plugin over manual persistence | Zero-code solution. Plugin handles save/restore of size, position, maximized state, and multi-monitor geometry. No JS-side code needed. |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| `setVesselPath is not a function` | Private signal setter never exposed on CargoStore interface | Added method to interface + factory return object |
| DOM shows `[object Object]` | `invoke<number>` on command returning full Session struct | Created `LaunchedSession` interface, extract `.id` |
| `pty_write: invalid type null` | JSON mode launch defaults to Terminal/PTY tab | Forward mode from LaunchDialog, conditionally connect PTY store |
| Window always tiny (800×600) | Default tauri.conf.json too small, no centering | Bumped to 1280×800, added `"center": true` |
| Window forgets size across launches | No persistence mechanism | Added `tauri-plugin-window-state` |
| pi CLI wrong flags | Used non-existent `chat` subcommand, wrong `--output-format` flag, missing `--print` | Verified actual CLI flags via `pi --help` and `pi chat --help`, corrected all three |
| No events reach UI (JSON mode) | Nobody read child stdout; no event format translation | Full stdout reader + 12-type event mapper in commands.rs |
| `JSON Parse error: Unexpected identifier "object"` (×3 locations) | Tauri v2 delivers payload as object, not string | `typeof === "string"` guard before `JSON.parse()` |

## Files Changed

| File | Change Summary |
|------|---------------|
| `src/store/cargo-store.ts` | Exposed `setVesselPath()` on public interface |
| `src/components/LaunchDialog.tsx` | Added `LaunchedSession` interface; fixed `invoke` type; pass mode through callback |
| `src/screens/VesselDetailScreen.tsx` | Accept mode from LaunchDialog; set correct default tab; conditional PTY connect |
| `src/components/terminal/CommsDeckPanel.tsx` | Defensive sessionId guard; typeof guard on pty-output/pty-exit payloads |
| `src/components/execution/PiExecutionPanel.tsx` | typeof guard on execution-update payload parsing |
| `src-tauri/tauri.conf.json` | Window 800×600 → 1280×800; added `"center": true` |
| `src-tauri/Cargo.toml` | Added `tauri-plugin-window-state = "2"` |
| `src-tauri/src/lib.rs` | Registered window-state plugin in setup |
| `src-tauri/src/pi_session/mod.rs` | Fixed `build_launch_command` flags (--print, --mode json, removed "chat"); added `take_child()` method; updated tests |
| `src-tauri/src/commands.rs` | Added 100-line pi JSONL→ExecutionUpdateEvent mapper (`map_pi_event`, `extract_text_content`); JSON-mode stdout reader tokio task in `session_launch` |

## Verification

- `cargo check` ✅ (clean, 2 pre-existing warnings only)
- `cargo test` ✅ (**159/159 passed**, 0 failed)
- `tsc --noEmit` ✅ (clean build)
- Manual verification: `pi --print --mode json` produces valid JSONL stdout with expected event types

## Open Items & Next Steps

- [ ] **End-to-end test**: Rebuild Tauri app, launch a real session, verify events flow through entire pipeline (pi → stdout → Rust reader → Tauri emit → frontend listener → applyEvent → UI update)
- [ ] **WelcomeScreen test failures**: 6 test files still failing (31 tests) due to WelcomeScreen rendering `[object Object]` badges — likely same root cause as #2 but in test rendering context, not directly related to this session's changes
- [ ] **PTY mode end-to-end**: JSON mode pipeline is now wired; PTY mode had existing wiring but may need similar event-format alignment testing
- [ ] **Error handling for dead pi process**: If the pi binary crashes or is killed, the stdout reader should emit an error event rather than silently stopping. Current code emits `status_changed(Done)` on EOF which is reasonable but could be more descriptive.
- [ ] **`computations outside createRoot` warnings (×7)**: Benign (7 signals in `createCargoStore()`) but could be eliminated by lazy-initializing cargo store inside a component tree if desired

---

*Log written by write-log skill*
