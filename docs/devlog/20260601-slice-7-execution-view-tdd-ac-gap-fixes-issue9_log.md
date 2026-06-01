# Slice 7: Execution View — AC Gap Fixes (TDD Session)

> **Date:** 2026-06-01
> **Type:** slice
> **Reference:** Issue #9 — [Slice 7: Execution View](https://github.com/AlexKucera/bridge/issues/9) (continuation of earlier session logs)

## Goal

Fill the 4 remaining acceptance criteria gaps from the Execution View (Slice 7) to bring it from a claimed 12/14 (with deferrals) to a verified **14/14 AC met** using strict TDD red-green-refactor per gap.

## What Was Done

### Gap 1: AC #12 — Unknown Event Types → Collapsible Raw JSON Block

**Problem:** The `applyEvent()` switch in `pi-store.ts` silently dropped unknown event types. No UI rendering existed for forward-compat with future Pi event types.

**TDD cycle:**
1. **RED** — Wrote 3 tests in `pi-store.test.ts`: capture single unknown event, accumulate multiple in order, clear on reset
2. **GREEN** — Added `unknownEvents: Record<string, unknown>[]` field to `ExecutionViewModel` interface; initialized in `defaultModel()`; added `default` case to `applyEvent()` switch that pushes raw events; verified `reset()` clears it
3. **RED** — Wrote 4 tests in `turn-list.test.tsx`: render unknown events as cards, handle nested objects, toggle collapse, circular-safe JSON
4. **GREEN** — Created `UnknownEventCard.tsx` component (~55 lines): collapsible header with ❓ icon + event type, expanded shows `<pre>` with `JSON.stringify(event, null, 2)` in try/catch for safety; wired into `TurnList.tsx` via `unknownEvents` prop and `<For>` block; wired through `PiExecutionPanel.tsx` from `store.model().unknownEvents`
5. **GREEN** — Created dedicated `unknown-event-card.test.tsx` with 7 tests: render type, fallback for missing type, collapsed default, expand/collapse, ARIA attributes, deep nesting safety
6. **GREEN** — Added ~60 lines of CSS for `.unknown-event-card` styles (purple accent bar, monospace type label, scrollable JSON pre)

### Gap 2: AC #6 — Auto-scroll to Bottom on New Activity

**Problem:** TurnList had scroll-*lock* logic (detects when user scrolls up) but never *auto-scrolled* to bottom when new turns arrived.

**TDD cycle:**
1. **RED** — Wrote 3 tests in `turn-list.test.tsx`: auto-scroll when turn count grows (mock scrollTop/scrollHeight/clientHeight), no auto-scroll when user scrolled up (lock active), resume auto-scroll after returning to bottom
2. **GREEN** — Added `createEffect` in `TurnList.tsx` that tracks `props.turns.length` and `props.unknownEvents?.length`; when either changes and `autoScroll()` is true, sets `el.scrollTop = el.scrollHeight`
3. **Gotcha:** Initial implementation used `requestAnimationFrame` which is a no-op in jsdom → tests timed out. Fixed by scrolling synchronously (SolidJS `createEffect` fires after DOM render, so direct scroll is safe)

### Gap 3: AC #14 — Virtualized Rendering for 100+ Turns

**Problem:** TurnList used plain `<For each={props.turns}>` which creates a DOM node per turn — 200 turns = 200 DOM nodes causing jank.

**TDD cycle:**
1. **RED** — Wrote 2 tests: 200 turns renders <20 DOM nodes (virtualized), 3 turns renders all 3 (no overhead for small lists)
2. **GREEN** — Integrated `@solid-primitives/virtual`'s `<VirtualList>` component into TurnList:
   - Added `VIRTUALIZATION_THRESHOLD = 10` — only virtualize above this count
   - Non-virtualized path: existing `<For each={props.turns}>` for ≤10 items
   - Virtualized path: `<VirtualList each={props.turns} rootHeight={800} rowHeight={200} overscanCount={3}>` for >10 items
   - Extracted `renderTurn()` helper to DRY both paths (explicit props instead of `{...spread}` to avoid reactivity issues)
3. **Gotcha:** First attempt used headless `createVirtualList()` with `visibleItems()` — items had undefined properties in jsdom because `clientHeight` was 0. Switched to pre-built `<VirtualList>` component which handles edge cases internally

### Gap 4: AC #4 — Status Badge Animation Test

**Problem:** CSS `@keyframes status-pulse` and `.status-badge--active` class existed but no test verified animation behavior per LiveState phase.

**TDD cycle:**
1. **RED** — Wrote 3 tests in `session-header.test.tsx`: active states (Thinking/RunningTool/StreamingText) get `status-badge--active` class, terminal states (Done/Error/Stopped) do NOT get it, idle states (Queued/Idle) get `status-badge--idle`
2. **GREEN** — Added `data-testid="status-badge"` to the status badge `<span>` in `SessionHeader.tsx`

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Use `default` case in switch vs explicit unknown handler | Switch default is the idiomatic TypeScript pattern for exhaustive-but-future-proof handling; captures ALL unknown types without maintaining a whitelist |
| `Record<string, unknown>[]` for unknown events | Preserves full payload shape without constraining to a specific interface; `JSON.stringify` handles any shape safely |
| Synchronous scroll in `createEffect` (no rAF) | `requestAnimationFrame` is a no-op in jsdom making tests impossible; SolidJS's `createEffect` fires after DOM update so synchronous scroll is safe |
| `<VirtualList>` component over `createVirtualList` headless API | Pre-built component handles jsdom edge cases (zero clientHeight, missing scroll events); headless API required manual container height management that broke in test env |
| Explicit props in `renderTurn()` vs `{...turn}` spread | Spread caused "Cannot read properties of undefined (reading 'id')" errors with virtual list's visible items — explicit props are safer across reactive boundaries |
| `VIRTUALIZATION_THRESHOLD = 10` | Avoids virtualization overhead for typical sessions (3-10 turns); only kicks in for power-user sessions with many turns |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| `requestAnimationFrame` no-op in jsdom | jsdom doesn't implement rAF — it never fires callbacks | Replaced with synchronous `el.scrollTop = el.scrollHeight` inside `createEffect` (safe because effect runs post-render) |
| `createVirtualList` `visibleItems()` returns undefined items | jsdom returns `clientHeight = 0`, causing virtual list to miscalculate visible range | Switched to pre-built `<VirtualList>` component which handles this internally |
| `{...turn}` spread fails with virtual list items | Virtual list's `visibleItems()` may return proxy/wrapped items that don't spread correctly | Extracted `renderTurn()` helper with explicit prop-by-prop destructuring |
| Test expected `scrollHeight - clientHeight` but got `scrollHeight` | Implementation sets `el.scrollTop = el.scrollHeight`; browser clamps to `scrollHeight - clientHeight` but jsdom doesn't clamp | Updated test expectations to match actual behavior (`scrollTop = scrollHeight`) |
| `vi.mock` factory parse errors (from prior session) | Vitest hoists mocks; TypeScript annotations cause parse errors | Used bare parameter names only in mock factories |

## Files Changed

| File | Change Summary |
|------|---------------|
| `src/lib/execution-types.ts` | Added `unknownEvents: Record<string, unknown>[]` to `ExecutionViewModel` |
| `src/store/pi-store.ts` | Added `unknownEvents` to `defaultModel()`; added `default` case to `applyEvent()` switch capturing unknown events |
| `src/components/execution/TurnList.tsx` | Major: integrated `<VirtualList>` for >10 turns; added `createEffect` auto-scroll; added `unknownEvents` prop + rendering; extracted `renderTurn()` helper |
| `src/components/execution/PiExecutionPanel.tsx` | Wired `unknownEvents={model().unknownEvents}` to TurnList |
| `src/components/execution/SessionHeader.tsx` | Added `data-testid="status-badge"` to status badge span |
| `src/components/execution/UnknownEventCard.tsx` | **New file** — collapsible raw JSON card for unknown event types (~55 lines) |
| `src/components/execution/index.ts` | Added barrel export for `UnknownEventCard` and `UnknownEventCardProps` |
| `src/bridge.css` | Added ~60 lines: `.unknown-event-card` styles (purple accent, monospace, scrollable JSON pre) |
| `src/tests/pi-store.test.ts` | +3 tests: unknown event capture, accumulation, reset clearance |
| `src/tests/execution-types.test.ts` | +1 test: unknownEvents defaults to empty array |
| `src/tests/turn-list.test.tsx` | +5 tests: unknown events rendering (3), auto-scroll (3), virtualization (2) |
| `src/tests/session-header.test.tsx` | +3 tests: active/terminal/idle status badge CSS classes |
| `src/tests/unknown-event-card.test.tsx` | **New file** — 7 tests: render, fallback, collapse/expand, toggle, ARIA, deep nesting |

## Acceptance Criteria Status

| # | Criteria | Status |
|---|----------|--------|
| 1 | pi-store holds ExecutionViewModel reactively via signals | ✅ |
| 2 | Store subscribes to Tauri events and applies state changes | ✅ |
| 3 | SessionHeader shows model, provider, thinking level, elapsed, status badge | ✅ |
| 4 | Status badge animates correctly per phase (pulse for active, solid for terminal) | ✅ **FIXED** |
| 5 | TurnList renders turns as collapsible cards in chronological order | ✅ |
| 6 | TurnList auto-scrolls to latest activity; pauses on manual scroll-up | ✅ **FIXED** |
| 7 | TurnCard expands/collapses on click; shows prompt, thinking, tools, response | ✅ |
| 8 | ToolCallCard shows tool name, target, status progression, duration, result preview | ✅ |
| 9 | All 5 tool call status states render distinctly | ✅ |
| 10 | ThinkingBubble collapses/expands; shows reasoning text when expanded | ✅ |
| 11 | TurnMetricsBar displays tokens, cost, tool count, duration per-turn | ✅ |
| 12 | Unknown event types render as non-crashing collapsible raw JSON block | ✅ **FIXED** |
| 13 | Text fields truncate at 50KB with "[truncated -- click to expand]" reveal | ✅ |
| 14 | TurnList uses virtualized rendering for 100+ turn sessions without jank | ✅ **FIXED** |

**14/14 AC met ✅**

## Test Results

```
Test Files  13 passed (13)   ← up from 12 (added unknown-event-card.test.tsx)
Tests       106 passed (106) ← up from 84 (+22 new tests, 0 regressions)
Duration    1.96s

Full suite: 396 passed / 11 failed (same 11 pre-existing failures)
```

## Open Items & Next Steps

- [ ] **GitNexus index refresh** — Run `npx gitnexus analyze` to pick up new symbols (UnknownEventCard, enhanced TurnList/PiExecutionPanel)
- [ ] **Wire PiExecutionPanel into app router** — New route `/session/:id` to view execution
- [ ] **Connect real Tauri events** — Wire `PiExecutionPanel` to live `execution-update` event stream
- [ ] **Slice 8**: Streaming animations (character-by-character response text, progress sweep for tool calls)

---
*Log written by write-log skill*
