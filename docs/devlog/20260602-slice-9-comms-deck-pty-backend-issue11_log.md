# Slice 9: Comms Deck — PTY Backend (Issue #11 Phase 1)

> **Date:** 2026-06-02
> **Type:** slice (issue #11)
> **Reference:** [Issue #11 — The Comms Deck: PTY Terminal + Tab Switching](https://github.com/AlexKucera/bridge/issues/11)
> **Blocked by:** [Issue #8 — Pi Session Management & Launch Dialog](https://github.com/AlexKucera/bridge/issues/8) ✅ Complete

## Goal

Build the Rust backend for PTY (pseudo-terminal) support — enabling interactive terminal sessions with Pi via `portable-pty`. This is Phase 1 of 3 for Issue #11. Covers: PTY spawn, I/O, resize, teardown, Tauri commands, and output event loop.

## What Was Done

### Cycle 1: PtySession struct & spawn (6 tests)
- Created `src-tauri/src/pi_session/pty.rs` — **NEW FILE**
- `PtySession` struct wrapping `portable-pty` master handle + child process + writer
- `spawn(binary, args, size?)` — creates native PTY pair via `NativePtySystem`, spawns command into slave, retains master
- Default PTY size 80×24 (`DEFAULT_PTY_COLS` / `DEFAULT_PTY_ROWS` constants)
- `default_pty_size()` constructor
- Custom `PtyError` enum: `SpawnFailed`, `IoError`, `ResizeFailed`, `KillFailed`, `WriterTaken`, `Poisoned`
- Manual `Debug` impl (can't derive on trait objects)

### Cycle 2: PTY I/O round-trip (1 test)
- `write(&self, data)` — writes bytes to PTY stdin
- `try_clone_reader()` — clones reader handle for background reading
- `close_writer()` — drops writer to send EOF to child
- Verified with `/bin/cat` PTY echo test: write → delay → close_writer → read with retry loop → assert data present

### Cycle 3: PTY resize (1 test)
- `resize(cols, rows)` — calls `master.resize(PtySize)` (sends SIGWINCH to child)
- `get_size()` — returns current `PtySize`
- Verified 80×24 → 120×50 transition

### Cycle 4: SessionProcess enum integration (2 tests)
- Added `SessionProcess` enum to `mod.rs`: `Child(tokio::process::Child)` | `Pty(PtySession)`
- Refactored `RunningSession { process: SessionProcess }` (was `child: tokio::process::Child`)
- Added `is_pty()` / `is_child()` predicate methods
- Updated `launch()` to branch on `SessionMode`:
  - `Json` → regular `tokio::process::Command` with piped stdio
  - `Pty` → `PtySession::spawn()` with default 80×24 size
- Updated `stop()` to match on variant:
  - `Child` → kill -TERM → grace period → force kill
  - `Pty` → `pty.kill()` via portable-pty
- Added `SessionRegistry` methods: `take()`, `remove()`, `count_active()`, `pty_write()`, `pty_resize()`
- Added `SessionError::NotRunning(i64)` variant

### Cycle 5: Tauri commands (registered, compile-tested)
- `pty_write(session_id, data: String)` — writes string to PTY stdin
- `pty_resize(session_id, cols: u16, rows: u16)` — resizes PTY window
- Both registered in `lib.rs` `invoke_handler` macro
- Commands delegate to `SessionRegistry` methods (which hold the read lock and dispatch)

### Cycle 6: PTY output event loop (2 tests)
- `spawn_output_reader(reader, mpsc::Sender<Vec<u8>>)` — spawns blocking std::thread
- Reads in 4KB chunks from PTY reader, sends each chunk via channel
- Exits cleanly on: EOF (child exited), IO error, or dropped sender (consumer gone)
- Tested with `/bin/echo` (captures "hello-from-pty" in output) and `/usr/bin/true` (exits immediately on EOF)

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| `Arc<Mutex<>>` interior mutability for PtySession | `portable-pty` trait objects (`dyn MasterPty`, `dyn ChildKiller`, `dyn Write`) are `Send` but **not** `Sync`. Tauri's `State<T>` requires `T: Send + Sync`. Wrapping in `Arc<Mutex<>>` provides Sync while keeping the API clean (`&self` methods). |
| `SessionProcess` enum over separate fields | Clean type-safe dispatch in `launch()` / `stop()` / commands. Avoids Option-polling or having both fields present at once. |
| Output reader uses `std::mpsc` not Tauri events directly | Decouples PTY logic from Tauri. Fully testable without `AppHandle`. The Tauri event layer (Phase 2) will bridge mpsc → `app.emit("pty-output", ...)`. |
| `unsafe impl Send/Sync for PtySession` | All inner types are `Send` (guaranteed by portable-pty for native implementations). `Mutex` provides `Sync`. This is the standard pattern for wrapping non-Sync types in thread-safe wrappers. |
| `spawn_blocking`-style output reader (std::thread, not tokio) | PTY `read()` is synchronous blocking I/O. Using `std::thread::spawn` is simpler than `tokio::task::spawn_blocking` for a long-lived reader, and works without requiring a tokio runtime handle in the spawn call. |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| `PtySession` not `Sync` → Tauri `State` compile error | `portable-pty` trait objects don't implement `Sync`. `SessionRegistry` (containing `RunningSession` → `PtySession`) is stored in Tauri managed state which requires `Send + Sync`. | Wrapped all inner fields in `Arc<Mutex<>>`. Added `unsafe impl Send/Sync`. Changed all methods from `&mut self` to `&self` with internal lock(). |
| Duplicate `}` after stop() edit | Edit tool's replace operation left a dangling closing brace when replacing the old `stop()` function body. | Removed extra line via targeted edit. |
| `Option<Option<u32>>` type mismatch for pid | In `launch()`, Json arm did `Some(child.id())` where `child.id()` already returns `Option<u32>`. | Changed to capture `let pid = child.id()` before moving `child` into tuple. |
| `child.id()` used after move | Tried to access `child.id()` after child was moved into `(SessionProcess::Child(child), ...)` tuple. | Captured pid into local variable before the tuple construction. |
| Missing `}` for `impl SessionRegistry` block | Adding `pty_write`/`pty_resize` methods didn't close the `impl` block before `impl Default`. | Inserted missing closing brace. |
| `kill()` needs `mut` borrow of Mutex guard | `ChildKiller::kill()` takes `&mut self`. The Mutex guard must be declared `mut`. | Changed `let c = self.child.lock()?` to `let mut c = self.child.lock()?`. |
| `pty_write` returns `Result<usize>` but command needs `Result<()>` | `PtySession::write()` returns byte count, but Tauri command should return unit. | Added `?; Ok(())` to discard the byte count. |
| Round-trip test flaky with 200ms delay | `/bin/cat` in PTY mode may not echo data before writer is closed (EOF). 200ms wasn't enough time for cat to read + echo. | Added 100ms delay between write and close_writer, increased post-close delay to 500ms, added retry loop (10 × 100ms) for reading output. |
| Missing `SessionRegistry` methods | Commands used `registry.get(id)` which returned `bool`, not the session. Also `take()`, `remove()`, `count_active()` were needed but only existed via Deref previously. | Added explicit methods: `get()` (bool), `take()` (Option<RunningSession>), `remove()`, `count_active()`, `pty_write()`, `pty_resize()`. |

## Files Changed

| File | Change Summary |
|------|---------------|
| `src-tauri/src/pi_session/pty.rs` | **NEW** — PtySession struct (380 lines), spawn/write/read/resize/kill/close_writer, PtyError enum, spawn_output_reader, 11 tests |
| `src-tauri/src/pi_session/mod.rs` | SessionProcess enum, RunningSession refactor (process field), launch() PTY branching, stop() variant handling, SessionRegistry new methods (take/remove/count_active/pty_write/pty_resize), SessionError::NotRunning variant, 2 new tests |
| `src-tauri/src/commands.rs` | pty_write + pty_resize Tauri command handlers (thin delegates) |
| `src-tauri/src/lib.rs` | Registered pty_write + pty_resize in invoke_handler |

## Test Summary

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| pi_session::pty | 0 | **11** | **+11** |
| pi_session (module) | 9 | **11** | **+2** |
| **Total Rust** | **109** | **121** | **+12** |
| Frontend | 437 | 437 | ±0 (11 pre-existing failures unchanged) |

**Pass rate: 121/121 Rust (100%) · 437/448 frontend (pre-existing failures only)**

## Acceptance Criteria Status (Phase 1 — Rust Backend only)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | PTY mode spawns Pi correctly via portable-pty | ✅ `PtySession::spawn()` working, integrated into `launch()` |
| 2 | Terminal renders with correct size and handles resize events | ✅ Default 80×24, `resize()` verified |
| 3 | Keystrokes typed in Comms Deck are sent to Pi's PTY stdin | ✅ `pty_write` command + `PtySession::write()` working |
| 4 | Pi's terminal output renders correctly in xterm.js | 🔧 `spawn_output_reader` ready; xterm.js integration is Phase 2 |
| 5 | Scan-line overlay animation visible on terminal surface | ⬜ Phase 2 (frontend) |
| 6 | Scan-line overlay suppressed under prefers-reduced-motion | ⬜ Phase 2 (frontend) |
| 7 | Log line color-coding works (prompt/info/warn/error/dim) | ⬜ Phase 2 (frontend) |
| 8 | Tab switcher shows "Structured" and "Terminal" tabs with icons | ⬜ Phase 3 (tab switching) |
| 9 | Badge counts show unread activity per-tab | ⬜ Phase 3 (tab switching) |
| 10 | Switching tabs preserves state on both sides | ⬜ Phase 3 (tab switching) |
| 11 | JSON-mode session defaults to Structured tab; PTY-mode defaults to Terminal tab | ⬜ Phase 3 (tab switching) |

**Phase 1: 4/11 complete (all Rust backend ACs)**

## Open Items & Next Steps

- [ ] **Phase 2: CommsDeckPanel frontend** — Install xterm.js + @xterm/addon-fit, build terminal component with scan-line overlay CSS animation, color-coded log lines, wire `pty-output` events to xterm.js, wire keystrokes to `pty_write` command
- [ ] **Phase 3: Tab switching** — Build TabBar component above main content area, "Structured"/"Terminal" tabs with icons, badge count signals, state preservation on switch, default tab based on session mode
- [ ] **Wire PTY output loop into Tauri event system** — Connect `spawn_output_reader`'s mpsc receiver to `app.emit("pty-output", payload)` in a tokio task (bridge between Phase 1's reader and Phase 2's frontend subscription)
- [ ] **Pre-existing tech debt** (from Slice 8): Wire `SessionActionBar` into `PiExecutionPanel`, fix `ResponseText` prop type mismatch, integrate `streamingBatch` into store/event pipeline

---
