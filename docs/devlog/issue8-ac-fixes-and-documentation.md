**Zero warnings from `pi_session`.** All 3 warnings are in `commands.rs` (unused imports — out of scope).

---

## Implementation Complete

### Changed Files

| File | Changes |
|------|---------|
| **`src-tauri/src/pi_session/mod.rs`** | Full rewrite with: |
| | • **Fix 1**: `stop()` now sends SIGTERM → waits grace period → SIGKILL fallback (was direct SIGKILL) |
| | • **Fix 2**: Session dir uses `dirs::data_dir()/bridge/sessions/` instead of `/tmp/bridge-sessions/` |
| | • **Fix 3**: Full `///` doc comments on **all 25+ public items** (`//!` module doc + every type, enum variant, struct field, function, method) |
| **`src/components/LaunchDialog.tsx`** | Full rewrite with: |
| | • **Fix 4**: Config summary & CLI preview now fetch live data via `invoke("config_get")` on open |
| | • **Fix 5**: Pre-flight check via `invoke("config_validate")`; launch button disabled when binary invalid; warning banner shown |
| | • **Fix 6**: Full JSDoc on component, props interface, signals, and functions |
| **`src/tests/launch-dialog.test.tsx`** | Updated mocks to support new `config_get`/`config_validate` calls; added 3 new tests (preflight fail/warning hidden/mode toggle in CLI preview); total 19/19 pass |

### Validation

| Check | Result |
|-------|--------|
| **Rust backend** (`cargo test`) | **134 passed, 0 failed** (3 suites, ~1.18s) |
| **Frontend** (Vitest full suite) | **307 passed, 11 failed** (11 failures = pre-existing, unchanged from baseline of 11) |
| **LaunchDialog tests specifically** | **19 passed, 0 failed** (up from 14 before) |
| **`cargo doc --no-deps`** | **0 warnings from `pi_session`** (only 3 pre-existing unused-import warnings in `commands.rs`) |

### Open Risks
- The 11 pre-existing frontend test failures (router, welcome screen, settings) are unrelated to this work
- 3 unused import warnings in `commands.rs` remain (out of scope)

### Recommended Next Step
- Clean up the 3 unused imports in `commands.rs` to get `cargo doc` fully clean
- Wire `EventEmitter.flush()` output through Tauri's `app_handle.emit()` so events actually reach the frontend