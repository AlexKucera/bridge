# Fix blank window after Issue #4 chrome implementation

> **Date:** 2026-05-23
> **Type:** issue
> **Reference:** [Issue #4 — App Chrome, Navigation & Welcome Screen](https://github.com/AlexKucera/bridge/issues/4)

## Goal

Diagnose and fix a completely blank Tauri window after Issue #4's implementation of app chrome (titlebar, bottom nav, router, WelcomeScreen). The window rendered with correct dimensions but showed no content — no titlebar text, no Welcome screen, no navigation.

## What Was Done

- **Fixed SolidJS router context failure in `src/App.tsx`** — Replaced `<Navigate href="/welcome" />` with an explicit `<Route path="/" component={WelcomeScreen} />` leaf route. Removed unused `Navigate` import.
- **Fixed duplicate chrome grid on `.launcher` class in `src/bridge.css`** — Changed `.launcher` from `height: 100vh; display: grid; grid-template-rows: 32px 1fr 48px;` (a copy-paste of `.app`) to `height: 100%; overflow-y: auto;` (plain block element).
- **Added missing `.app__main` scroll containment rule in `src/bridge.css`** — New rule with `min-height: 0; overflow-y: auto;` to constrain the CSS Grid middle track so long content scrolls internally instead of pushing the bottom nav off-screen.
- **Fixed 3 pre-existing test assertion mismatches in `src/tests/router.test.tsx`** — Updated expectations for FleetDashboard, FleetChartsScreen, and HelmPanel stub routes to match actual rendered placeholder text (the tests expected heading strings like "Fleet Dashboard" that the stub components never render).

## Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Replace `<Navigate>` with explicit leaf route | `<Navigate>` as a sibling of child `<Route>` elements inside a layout `<Route>` tears down SolidJS's `RouterContextObj`, causing all router primitives (`<A>`, `useLocation`, etc.) to throw. An explicit leaf `/` → `WelcomeScreen` route achieves the same redirect-to-welcome behavior without breaking context. |
| Make `.launcher` a plain scrolling block | The `.launcher` div is already nested inside `.app > .app__main`. It should NOT re-declare the full chrome grid layout — that's the parent's job. It just needs to fill available height and scroll if content overflows. |
| Add `min-height: 0` on `.app__main` | CSS Grid tracks have implicit `min-height: auto` which prevents them from shrinking below their content size. Without this, the `1fr` middle track expands to fit its children, pushing the fixed-size bottom nav row out of viewport. This is the standard CSS Grid scroll containment pattern. |

## Gotchas & Fixes

| Problem | Root Cause | Fix |
|---------|------------|-----|
| **Completely blank window (#app empty, 0px height)** | `<Navigate href="/welcome" />` placed as sibling of child `<Route>` elements inside layout route broke SolidJS router context. Error: `<A> and 'use' router primitives can be only used inside a Route.` | Replaced `<Navigate>` with explicit leaf `<Route path="/" component={WelcomeScreen} />` |
| **Titlebar visible but rest cut off — no bottom nav (user-reported)** | `.launcher` CSS was a copy-paste of `.app`: declared `height: 100vh; display: grid; grid-template-rows: 32px 1fr 48px;` creating a nested full-viewport chrome grid inside the already-chromed content area | Changed to `height: 100%; overflow-y: auto;` (plain block) |
| **Bottom nav pushed off-screen even after launcher fix** | No `.app__main` rule existed. CSS Grid default `min-height: auto` prevented the middle track from shrinking below content size, so 801px of WelcomeScreen content pushed the 48px bottom nav below viewport bottom (600px) | Added `.app__main { min-height: 0; overflow-y: auto; }` |
| **3 failing router tests (pre-existing)** | Test assertions expected heading text ("Fleet Dashboard", "Fleet Charts", "Helm Panel") that stub screen components never render — they show placeholder `<p>` text instead | Updated assertions to match actual rendered placeholder text |

### Diagnostic Approach

Used Playwright (already a dev dependency) to capture DOM snapshots and computed styles at `http://localhost:1420/`. Key diagnostic output:

```
# Before Bug 1 fix:
#app innerHTML: "" (empty, 0 children)
#app height: 0px
.app element: "no .app element found!"
Console error: "<A> and 'use' router primitives can be only used inside a Route"

# After Bug 1 fix, before Bug 2+3:
.app: 0–600 ✅
.app__main: 32–833 ❌ (overflows by 233px)
.bottomnav: 833–881 ❌ (off-screen)

# After all fixes:
.app: 0–600 ✅
.app__main: 32–552 ✅
.bottomnav: 552–600 ✅ (pinned)
```

## Files Changed

| File | Change Summary |
|------|---------------|
| `src/App.tsx` | Removed `<Navigate>` + import; added explicit `<Route path="/" component={WelcomeScreen} />` leaf route |
| `src/bridge.css` | Fixed `.launcher` (removed duplicate chrome grid); added `.app__main { min-height: 0; overflow-y: auto; }` rule |
| `src/tests/router.test.tsx` | Fixed 3 assertion matchers to match actual stub component output |

## Open Items & Next Steps

- [ ] Verify fix in actual Tauri native window (not just browser at localhost:1420) — CSS may behave differently in Tauri's webview vs browser
- [ ] Consider whether `style.css` (Vite template scaffold file) should be removed entirely — it contains conflicting `#app` styles (`width: 1126px`, centered layout) that aren't imported now but could cause issues if accidentally added
- [ ] The `.launcher` class name is misleading (suggests it might be a root-level layout). Rename to something like `.welcome` or `.launcher-screen` in a future cleanup pass

---

*Log written by write-log skill*
