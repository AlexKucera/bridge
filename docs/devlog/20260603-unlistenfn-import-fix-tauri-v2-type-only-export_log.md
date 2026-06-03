# UnlistenFn Import Fix — Tauri v2 Type-Only Export

> **Date:** 2026-06-03
> **Type:** generic
> **Reference:** Follow-up to Issue #14 (Slice 12)

## Goal

Fix runtime `SyntaxError: Importing binding name 'UnlistenFn' is not found` that caused the Tauri window to render blank after the Slice 12 Captain's Log implementation.

## What Was Done

- Split `UnlistenFn` import into a **type-only** import in 2 files that used value-import syntax on a type-only export from `@tauri-apps/api/event`

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Use `import type { UnlistenFn }` separate from `import { listen }` | In Tauri v2, `UnlistenFn` is declared as `export type` (not `export`). Value imports of type-only exports cause a runtime SyntaxError in bundlers. The type import is still needed for the `let unlisten: UnlistenFn = null` variable annotation. |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| `SyntaxError: Importing binding name 'UnlistenFn' is not found` — blank window at launch | Two files imported `{ listen, UnlistenFn }` as a value binding, but `@tauri-apps/api/event` only exports `UnlistenFn` as a **type** (`declare export type UnlistenFn`) | Changed to separate imports: `import { listen } from ...` + `import type { UnlistenFn } from ...` |

### Files fixed:
1. `src/store/log-store.ts`
2. `src/components/ActivityFeedPanel.tsx`

## Files Changed

| File | Change Summary |
|------|---------------|
| `src/store/log-store.ts` | Split `import { listen, UnlistenFn }` → value import + type import |
| `src/components/ActivityFeedPanel.tsx` | Same split fix |

## Open Items & Next Steps

- None — this was a complete hotfix. App should now render correctly.

---

*Log written by write-log skill*
