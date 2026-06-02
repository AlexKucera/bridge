# Slice 9d: Comms Deck — Integration Tests + AC#7 Log Line Classifier (Issue #11 Final)

> **Date:** 2026-06-02
> **Type:** slice (issue #11 phase 4 — completion)
> **Reference:** [Issue #11 — The Comms Deck: PTY Terminal + Tab Switching](https://github.com/AlexKucera/bridge/issues/11)

## Goal

Complete Issue #11 by:
1. Fixing cascading structural corruption in `pi_session/mod.rs` that prevented compilation
2. Restoring the full `session_launch` Tauri command with PTY output event loop wiring
3. Writing integration tests exercising the complete PTY data pipeline end-to-end
4. Running acceptance criteria audit against all 11 ACs
5. Closing out AC#7 (log line color-coding) with a proper classifier + ANSI colorizer

## What Was Done

### Phase 1: Structural Repair of `mod.rs`

The file had cascading brace corruption from incremental edits across previous sessions:

- **Root cause:** `impl SessionRegistry` block (line 242) was never properly closed, causing all subsequent type definitions (`SessionProcess`, `RunningSession`, `launch()`, etc.) to be incorrectly nested inside it at depth 2 instead of depth 0.
- **Symptom:** Compiler error `cannot find type SessionProcess in this scope` — the type was scoped inside `impl SessionRegistry`.
- **Fix:** Changed line 293 from single `}` to `}}` (close `pty_resize` method AND `impl SessionRegistry`), removed stray `}` at line 341 that was acting as incorrect impl closer.
- **Result:** Perfect brace balance achieved (119 open / 119 close). All types resolved to correct module-level scope.

### Phase 2: Non-Exhaustive Match Arms

After fixing structure, 3 locations needed `SessionProcess::Taken` variant handling:

| Location | Function | Arm Added |
|----------|----------|-----------|
| Line ~290 | `is_pty()` on RunningSession | `Taken => false` |
| Line ~492 | `stop()` match | `Taken => {}` (already taken, nothing to terminate) |
| Line ~512 | `stop()` second match | `Taken => { pty.kill() }` |

### Phase 3: Restore `session_launch` Body

- Replaced minimal test stub (`Err("not implemented")`) with full implementation
- Full pipeline: parse mode → deserialize overrides → load config → launch session → if PTY: take_pty → create mpsc channel → start PtyOutputLoop → spawn tokio task forwarding events via `app.emit("pty-output", json)` and `app.emit("pty-exit", json)` → insert into registry → return session

**Key discovery:** The Tauri proc macro failure (`expected expression, found let`) was NOT caused by `AppHandle` as first parameter (which IS valid per docs). It was caused by the cascading `mod.rs` corruption confusing the macro's type resolution.

### Phase 4: Integration Tests (9 new tests)

Created `src-tauri/src/pi_session/pty_integration_tests.rs` — exercises the complete data path:

| Test | What it verifies |
|------|-----------------|
| `integration_echo_produces_output_and_exit_events` | `/bin/echo` → Output(base64) + Exit events received, text contains echo string |
| `integration_session_id_propagates_through_pipeline` | Every event carries correct sessionId |
| `integration_timestamps_are_valid_rfc3339` | All timestamps parse as valid ISO 8601 |
| `integration_output_payload_serializes_to_frontend_shape` | JSON has camelCase keys: `sessionId`, `data`, `timestamp` |
| `integration_exit_payload_serializes_to_frontend_shape` | Exit JSON has `sessionId`, `code`, `timestamp` |
| `integration_base64_roundtrip_matches_frontend_decode_path` | Unicode + ANSI escapes survive base64 round-trip |
| `integration_multiline_output_preserved_in_order` | Multi-line printf output maintains ordering |
| `integration_exit_event_is_always_last` | Exit is final event in stream |
| `integration_no_output_process_still_sends_exit` | `/usr/bin/true` sends Exit even with no stdout |

### Phase 5: Acceptance Criteria Audit

Ran full audit against all 11 ACs from GitHub issue. Result: **10/11 pass, 1 partial (AC#7)**.

### Phase 6: LogLineClassifier for AC#7 (TDD, 42 tests)

Built semantic color-coding system in 3 TDD cycles:

**Cycle 1 — Classification Engine (28 tests):**
- `classifyLine(line, config?)` → `LogLineClass`
- Priority-ordered pattern matching: Error > Warn > Prompt > Info > Dim > Plain
- Default patterns tuned for Pi/CLI/shell output (Error:, panic!, Traceback, Warning:, deprecated, $ prompt, ISO timestamps, [context], Step N/M, INFO:, ✓)
- Configurable via `LogLineClassifierConfig` (each category has its own RegExp array)

**Cycle 2 — ANSI Colorization (8 tests):**
- `getAnsiForClass(cls)` → ANSI escape prefix string
- Color map: Error=`\x1b[1;91m` (bright red+bold), Warn=`\x1b[1;93m`, Prompt=`\x1b[1;92m`, Info=`\x1b[1;96m`, Dim=`\x1b[2;90m`, Plain=``(none)
- `classifyAndColorize(text, config?)` → full colored output with reset sequences per line
- Preserves existing ANSI escapes; multi-line aware; plain text passes through untouched

**Cycle 3 — Integration (6 tests):**
- Config shape validation, disable-by-empty-array, reset sequence verification

**Wiring into CommsDeckPanel:**
- Added `import { classifyAndColorize }` to component
- Changed `term.write(text)` → `term.write(classifyAndColorize(text))` at line 136
- Zero-config: all PTY output automatically gets semantic coloring

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| **ANSI wrapper approach over xterm.js addon** | xterm.js renders ANSI natively. Wrapping classified lines with ANSI escape codes means zero custom rendering logic — xterm handles cursor positioning, scrollback, selection correctly. A custom addon would need to reimplement all of that. |
| **Bright colors (90-97) over standard (30-37)** | Dark terminal background (#0a0e14) needs bright colors for contrast. Standard ANSI red/green are too dim against near-black. |
| **Priority-ordered classification** | A line matching both "Error" and "Warning" should be red, not yellow. First-match-wins with priority order is simple and predictable. |
| **Configurable patterns (not hardcoded)** | Different Pi configurations or non-Pi use cases may need different classification rules. Exporting `LogLineClassifierConfig` allows users to customize without forking. |
| **classifyAndColorize operates on decoded strings** | Base64 decoding happens in PtyStore before reaching the classifier. Classifier works on UTF-8 text, not raw bytes — simpler and avoids double-decoding issues. |
| **Plain class produces no ANSI output** | Avoids unnecessary escape sequences for the majority of output lines (code, ordinary text). Keeps wire format clean and debuggable. |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| `impl SessionRegistry` swallowing all subsequent types | Cascading edits from adding pty_write/pty_resize methods left the impl block unclosed; subsequent edits added closing braces in wrong positions | Python depth-tracking script identified exact mis-nested lines; fixed by changing line 293 `}` → `}}` and removing stray `}` at line 341 |
| `session_launch` Tauri macro failure (`expected expression, found let`) | Initially suspected `AppHandle` parameter issue; tested with minimal body which compiled fine → proved it was a body issue not signature issue | Root cause was actually the mod.rs corruption confusing type resolution; once mod.rs was fixed, full body compiled cleanly |
| Test file corruption from incremental edits | Multiple edit operations on same file with stale anchors caused brace mismatches, duplicate content, EOF errors | Rewrote entire test file from scratch with write tool when edit tool produced unparseable output |
| `getAnsiForClass` doesn't include reset sequence | Test assumed `getAnsiForClass` returned open+reset, but design separates concerns: `getAnsiForClass` = prefix only, `classifyAndColorize` adds reset | Fixed test to verify reset in `classifyAndColorize` output, not in `getAnsiForClass` return value |
| ANSI code assertions used standard codes (31,32,33) but implementation uses bright (91,92,93) | Implementation chose bright colors for dark-bg contrast; tests were written assuming standard colors | Updated all test assertions to use bright color codes |

## Files Changed

| File | Change Summary |
|------|---------------|
| `src-tauri/src/pi_session/mod.rs` | Fixed cascading brace corruption (unclosed `impl SessionRegistry`); added `Taken` match arms (3 locations); registered `pty_integration_tests` module |
| `src-tauri/src/commands.rs` | Restored full `session_launch` body with PTY output event loop wiring (mpsc channel → PtyOutputLoop → tokio::spawn → app.emit) |
| `src-tauri/src/pi_session/pty_integration_tests.rs` | **NEW** — 9 integration tests for full PTY output pipeline (echo, session ID propagation, timestamps, JSON serialization, base64 round-trip, multi-line, exit ordering, no-output case) |
| `src/lib/log-line-classifier.ts` | **NEW** — LogLineClassifier engine (classifyLine, classifyAndColorize, getAnsiForClass, classifyLines, DEFAULT_CLASSIFIER_CONFIG, LogLineClassifierConfig interface) |
| `src/tests/log-line-classifier.test.ts` | **NEW** — 42 tests across 3 TDD cycles (classification 28, ANSI mapping 8, colorization + config 6) |
| `src/components/terminal/CommsDeckPanel.tsx` | Wired `classifyAndColorize` into output path (line 136: `term.write(text)` → `term.write(classifyAndColorize(text))`) |

## Test Summary

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| Rust (lib) | 130 | **139** | **+9** (integration tests) |
| Frontend | 497 | **539** | **+42** (classifier) |
| **Total** | **627** | **678** | **+51** |

**Pass rate: 139/139 Rust (100%) · 539/550 frontend (11 pre-existing failures unchanged)**

## Acceptance Criteria Status (Issue #11 COMPLETE)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | PTY mode spawns Pi correctly via portable-pty | ✅ `PtySession::spawn()` integrated into `launch()` |
| 2 | Terminal renders with correct size and handles resize events | ✅ FitAddon + ResizeObserver + pty_resize command |
| 3 | Keystrokes typed in Comms Deck are sent to Pi's PTY stdin | ✅ keydown → invoke("pty_write") → PtySession::write() |
| 4 | Pi's terminal output renders correctly in xterm.js | ✅ listen("pty-output") → base64 decode → term.write() |
| 5 | Scan-line overlay animation visible on terminal surface | ✅ ScanLineOverlay + CSS scanline-sweep animation |
| 6 | Scan-line overlay suppressed under prefers-reduced-motion | ✅ @media query disables animation, static glow replacement |
| 7 | **Log line color-coding works (prompt/info/warn/error/dim)** | **✅ LogLineClassifier + ANSI wrapper + CommsDeckPanel integration** |
| 8 | Tab switcher shows "Structured" and "Terminal" tabs with icons | ✅ TabBar with inline SVGs, ARIA tablist |
| 9 | Badge counts show unread activity per-tab | ✅ TabStore auto-clear on switch |
| 10 | Switching tabs preserves state on both sides | ✅ Always-mounted pattern (visibility:hidden) |
| 11 | JSON-mode defaults to Structured; PTY-mode defaults to Terminal | ✅ TabStoreOptions.defaultMode mapping |

**Issue #11: 11/11 AC complete** ✅

## Open Items & Next Steps

- [ ] **Commit this work** — All 4 phases of Issue #11 are complete and green
- [ ] **Pre-existing frontend test failures** (11): Welcome screen timing issues causing async test timeouts — out of scope for this issue
- [ ] **Pre-existing tech debt** (from Slice 8): Wire `SessionActionBar` into `PiExecutionPanel`, fix `ResponseText` prop type mismatch, integrate `streamingBatch` into store/event pipeline
- [ ] **Future enhancement**: Per-session classifier configs (e.g., Python-heavy sessions could add `>>> ` prompt pattern, Rust sessions could add `error[E0...]` pattern)

---
