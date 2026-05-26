# Fix: Tokio Runtime Panic on App Startup

> **Date:** 2026-05-26
> **Type:** generic
> **Reference:** N/A — hotfix for regression introduced in Slice 3

## Goal

Fix a panic-on-startup that left the app completely non-functional after the Slice 3 changes (SQLite data layer + vessel CRUD).

## What Was Done

- **Diagnosed** the crash from `npx tauri dev` output: `panicked at src/lib.rs:30:16` with message *there is no reactor running, must be called from the context of a Tokio 1.x runtime*
- **Identified root cause:** `lib.rs` line 30 called `tokio::runtime::Handle::current()` inside Tauri's `setup` closure, which runs synchronously on the main thread before any async runtime exists
- **Applied fix** — changed line 30 from `Handle::current()` to `Runtime::new()`, creating a dedicated runtime for the synchronous DB init work
- **Verified** via `cargo check` — clean compile, no errors

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Use `Runtime::new()` instead of `Handle::current()` | The `setup` closure is sync; no Tokio runtime is active. Creating a dedicated runtime is the standard pattern for blocking async calls from sync context in Tauri setup. |
| Keep `rt.block_on()` pattern | The DB open + migrate calls are async (`open_database`, `migrate`). Blocking them on a fresh runtime is correct — this only runs once at startup. |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| `panic: there is no reactor running` at `lib.rs:30` | Slice 3 introduced `tokio::runtime::Handle::current()` to get a handle for `block_on(open_database(...))`. But Tauri's `.setup(\|app\| { ... })` runs synchronously on the main thread — no Tokio runtime exists yet. | Replaced `Handle::current()` with `Runtime::new()` which creates a new runtime inline. |

**Full error trace (key frame):**
```
thread 'main' panicked at src/lib.rs:30:16:
there is no reactor running, must be called from the context of a Tokio 1.x runtime
```

## Files Changed

| File | Change Summary |
|------|---------------|
| `src-tauri/src/lib.rs` (line 30) | Changed `tokio::runtime::Handle::current()` → `tokio::runtime::Runtime::new()` |

## Open Items & Next Steps

- [ ] Run `npx tauri dev` end-to-end to confirm app launches and DB initializes correctly
- [ ] Consider whether the per-startup `Runtime::new()` overhead warrants moving DB init into an async plugin or lazy initialization pattern
- [ ] Update GitNexus index after fix (`npx gitnexus analyze`) since lib.rs changed

---

*Log written by write-log skill*
