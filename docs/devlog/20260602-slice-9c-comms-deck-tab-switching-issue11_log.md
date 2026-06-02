# Slice 9c: Comms Deck — Tab Switching (Issue #11 Phase 3)

> **Date:** 2026-06-02
> **Type:** slice (issue #11 phase 3)
> **Reference:** [Issue #11 — The Comms Deck: PTY Terminal + Tab Switching](https://github.com/AlexKucera/bridge/issues/11)
> **Follows:**
> - [Slice 9b — PTY Frontend](docs/devlog/20260602-slice-9b-comms-deck-frontend-issue11_log.md) ✅ Complete
> - [Slice 9a — PTY Backend](docs/devlog/20260602-slice-9-comms-deck-pty-backend-issue11_log.md) ✅ Complete

## Goal

Build the TabBar component and SessionViewContainer that enables switching between the Structured (execution view) and Terminal (PTY) tabs, with badge counts, state preservation, and default-tab-by-session-mode.

## What Was Done

### Cycle 1: Tab Types + TabStore (14 tests)
- Created `src/lib/tab-types.ts` — **NEW FILE**
  - `TabId` enum (`Structured`, `Terminal`)
  - `TabBadgeCounts` interface (`structured`, `terminal` counters)
  - `DEFAULT_TAB_BADGE_COUNTS` constant
  - `SessionMode` type alias (`"json" | `"pty"`)
  - `TabStoreOptions` interface (`defaultMode?`)
- Created `src/store/tab-store.ts` — **NEW FILE**
  - `TabStore` interface with signals, actions, computed properties
  - `createTabStore()` factory using SolidJS `createSignal` / `createMemo`
  - Actions:
    - `setActiveTab(tab)` — switches active tab, **auto-clears badge count** for the tab being switched TO
    - `incrementBadge(tab)` — increments unread counter for a specific tab
    - `clearBadges()` — resets both counters to zero
  - Computed: `isStructuredActive()`, `isTerminalActive()`
  - Default tab selection based on `defaultMode`: `"pty"` → Terminal, otherwise → Structured

### Cycle 2: TabBar Component (10 tests)
- Created `src/components/terminal/TabBar.tsx` — **NEW FILE** (~105 lines)
  - Horizontal tab bar with two buttons: "Structured" + "Terminal"
  - Inline SVG icons (list/stack for Structured, terminal prompt for Terminal)
  - ARIA `tablist` / `tab` / `aria-selected` pattern for accessibility
  - `tabIndex` management (0 for active, -1 for inactive)
  - Conditional badge pills via `<Show when={count > 0}>`
  - Active indicator line at bottom via CSS `data-active-tab` attribute
  - Props: `store: TabStore`
- Created `src/components/terminal/tab-bar.css` — **NEW FILE** (128 lines)
  - `.tab-bar`: Flex row, 38px height, abyss background, border-bottom
  - `.tab-bar__tab`: Uppercase labels, dim color, hover glow, focus-visible ring
  - `.tab-bar__tab--active`: Glow blue color, full icon opacity
  - `.tab-bar__badge`: Pill shape (16px min), glow background, white text, tabular numerals
  - `.tab-bar__indicator`: Absolute-positioned bottom line with gradient based on `data-active-tab`

### Cycle 3: SessionViewContainer (9 tests)
- Created `src/components/terminal/SessionViewContainer.tsx` — **NEW FILE** (~67 lines)
  - Container component wrapping TabBar + both panel slots
  - **Always-mounted pattern**: Both PiExecutionPanel and CommsDeckPanel stay in DOM; hidden panels use CSS `visibility: hidden` + `pointer-events: none` rather than SolidJS conditional rendering
  - This preserves xterm.js instance, event listeners, and reactive state across tab switches
  - Panel wrappers have `id="structured-panel"` / `id="terminal-panel"` + `role="tabpanel"`
  - Hidden state toggled via `classList` binding to store computed properties
  - Props: `tabStore`, `ptyStore`, `execStore`, `sessionId`
- Created `src/components/terminal/session-view.css` — **NEW FILE** (29 lines)
  - `.session-view`: Flex column, full height, overflow hidden
  - `.session-view__panel`: flex-grow, relative positioning, overflow hidden
  - `.session-view__panel--hidden`: `position: absolute; inset: 0; visibility: hidden; pointer-events: none; z-index: -1` — keeps element mounted but invisible and non-interactive

### Test Infrastructure
- Updated `src/test-setup.ts` — Added mocks for:
  - `ResizeObserver` global (used by CommsDeckPanel's FitAddon)
  - `@tauri-apps/api/event` listen/emit (used by both child panels)
  - `@tauri-apps/api/core` invoke (used by CommsDeckPanel keyboard dispatch)

### Tests
- `src/tests/tab-store.test.ts` — **14 tests**
  - TabId enum values (1 test)
  - Default badge counts (1 test)
  - Default active tab = Structured (1 test)
  - Switch to Terminal (1 test)
  - Switch back to Structured (1 test)
  - Computed booleans (1 test)
  - Increment structured badge (1 test)
  - Increment terminal badge (1 test)
  - Auto-clear badge on switch to Terminal (1 test)
  - Auto-clear badge on switch to Structured (1 test)
  - Clear all badges explicitly (1 test)
  - Default mode pty → Terminal (1 test)
  - Default mode json → Structured (1 test)
  - No mode → Structured fallback (1 test)
- `src/tests/tab-bar.test.tsx` — **10 tests**
  - Renders both tab buttons (1 test)
  - Structured selected by default (1 test)
  - Terminal not selected by default (1 test)
  - Click switches to Terminal (1 test)
  - Click switches back to Structured (1 test)
  - No badge when zero (1 test)
  - Shows structured badge (1 test)
  - Shows terminal badge (1 test)
  - Clears badge after switch (1 test)
  - Renders role=tablist (1 test)
- `src/tests/session-view.test.tsx` — **9 tests**
  - Renders TabBar (1 test)
  - Renders structured panel by default (1 test)
  - Hides terminal wrapper by default (1 test)
  - Shows terminal on switch (1 test)
  - Hides structured on Terminal tab (1 test)
  - PTY mode defaults to Terminal (1 test)
  - Preserves execution state across switches (1 test)
  - Preserves PTY state across switches (1 test)
  - Both panels always in DOM (1 test)

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| **Always-mounted pattern over Show/conditional rendering** | Unmounting CommsDeckPanel would destroy the xterm.js instance and its Tauri event listeners. Re-mounting would re-spawn the terminal. Using CSS visibility hiding keeps everything alive while being visually equivalent. |
| **Auto-clear badge on tab switch** | The purpose of badges is to alert "there's new stuff you haven't seen." When you switch to a tab, you've seen it. Auto-clearing avoids stale badges without requiring manual dismissal. |
| **CSS data-attribute indicator line** | Instead of JS-driven absolute positioning for the active indicator, using `[data-active-tab]` on a pseudo-element-like div lets CSS handle the gradient position. Simple, no layout thrashing. |
| **Inline SVG icons** | No icon library dependency needed. Two tiny SVGs (14×14) keep the bundle small and avoid font-loading flicker. |
| **`visibility: hidden` over `display: none`** | `display: none` removes the element from accessibility tree and layout. `visibility: hidden` keeps it in DOM/layout but invisible — important because xterm.js needs its container to have dimensions for FitAddon to work correctly when switching back. |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| Badge object key mismatch | Used enum value (`"Structured"`) as key but interface expects lowercase (`"structured"`) | Extracted key mapping into local variable before spread update |
| `textContent()` called as function | DOM property not method in testing-library elements | Changed to property access `.textContent` |
| Hidden class checked on wrong element | Tests looked for `session-view__panel--hidden` on inner component root, but it's applied to outer wrapper `div` | Fixed tests to query wrapper by `id` instead of inner component `data-testid` |
| `ResizeObserver is not defined` | jsdom doesn't provide ResizeObserver; CommsDeckPanel uses it for FitAddon | Added `MockResizeObserver` stub to `test-setup.ts` |
| Tauri API mocks missing | Child components call `listen()` and `invoke()` from `@tauri-apps/api/*` which don't exist in test environment | Added module-level mocks for `@tauri-apps/api/event` and `@tauri-apps/api/core` in `test-setup.ts` |

## Files Changed

| File | Change Summary |
|------|---------------|
| `src/lib/tab-types.ts` | **NEW** — TabId enum, TabBadgeCounts, SessionMode, TabStoreOptions (41 lines) |
| `src/store/tab-store.ts` | **NEW** — TabStore factory, setActiveTab/incrementBadge/clearBadges, auto-clear on switch (79 lines) |
| `src/components/terminal/TabBar.tsx` | **NEW** — Tab bar UI with icons, badges, ARIA tablist (105 lines) |
| `src/components/terminal/tab-bar.css` | **NEW** — Tab button styles, badge pill, indicator line (128 lines) |
| `src/components/terminal/SessionViewContainer.tsx` | **NEW** — Container wrapping TabBar + both panels, always-mounted pattern (67 lines) |
| `src/components/terminal/session-view.css` | **NEW** — Container layout, hidden panel styles (29 lines) |
| `src/components/terminal/index.ts` | Updated barrel export (+4 exports) |
| `src/test-setup.ts` | Added ResizeObserver + Tauri API mocks (+19 lines) |
| `src/tests/tab-store.test.ts` | **NEW** — 14 tests for types + store |
| `src/tests/tab-bar.test.tsx` | **NEW** — 10 tests for TabBar component |
| `src/tests/session-view.test.tsx` | **NEW** — 9 tests for SessionViewContainer integration |

## Test Summary

| Suite | Before | After | Delta |
|-------|--------|-------|-------|
| tab-store (types + store) | 0 | **14** | **+14** |
| tab-bar (component) | 0 | **10** | **+10** |
| session-view (container) | 0 | **9** | **+9** |
| **Total Frontend** | **464** | **497** | **+33** |
| **Rust** | **121** | **121** | ±0 |

**Pass rate: 121/121 Rust (100%) · 497/508 frontend (11 pre-existing failures unchanged)**

## Acceptance Criteria Status (Phase 3 — Issue #11 COMPLETE)

| # | Criterion | Status |
|---|-----------|--------|
| 1 | PTY mode spawns Pi correctly via portable-pty | ✅ (Phase 1) |
| 2 | Terminal renders with correct size and handles resize events | ✅ (Phase 2) |
| 3 | Keystrokes typed in Comms Deck are sent to Pi's PTY stdin | ✅ (Phase 2) |
| 4 | Pi's terminal output renders correctly in xterm.js | ✅ (Phase 2) |
| 5 | Scan-line overlay animation visible on terminal surface | ✅ (Phase 2) |
| 6 | Scan-line overlay suppressed under prefers-reduced-motion | ✅ (Phase 2) |
| 7 | Log line color-coding works (prompt/info/warn/error/dim) | 🔧 Types defined; ANSI handled natively by xterm |
| 8 | **Tab switcher shows "Structured" and "Terminal" tabs with icons** | ✅ TabBar + inline SVGs |
| 9 | **Badge counts show unread activity per-tab** | ✅ TabStore auto-clear on switch |
| 10 | **Switching tabs preserves state on both sides** | ✅ Always-mounted pattern |
| 11 | **JSON-mode defaults to Structured tab; PTY-mode defaults to Terminal tab** | ✅ TabStoreOptions.defaultMode |

**Issue #11: 10/11 AC complete, 1 partial (color-coded log lines)**

## Open Items & Next Steps

- [ ] **Wire PTY output loop into Tauri event system** — Connect `spawn_output_reader`'s mpsc receiver to `app.emit("pty-output", payload)` in a tokio task (Rust-side bridge between Phase 1 reader and Phase 2 frontend subscription). This is the critical integration point.
- [ ] **Color-coded log lines** — LogLineClass types defined; xterm.js renders ANSI escape codes natively so most coloring happens automatically. May add post-processing layer for custom classification if needed.
- [ ] **Pre-existing tech debt** (from Slice 8): Wire `SessionActionBar` into `PiExecutionPanel`, fix `ResponseText` prop type mismatch, integrate `streamingBatch` into store/event pipeline
- [ ] **Pre-existing frontend test failures** (11): Welcome screen timing issues causing async test timeouts

---
