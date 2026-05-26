<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **bridge** (414 symbols, 454 relationships, 6 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/bridge/context` | Codebase overview, check index freshness |
| `gitnexus://repo/bridge/clusters` | All functional areas |
| `gitnexus://repo/bridge/processes` | All execution flows |
| `gitnexus://repo/bridge/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

## Session Logs

Session logs are written to `docs/devlog/` after each completed task, issue fix, or milestone.
They capture what was done, decisions & rationale, gotchas & fixes, and next steps. Before starting a new session, read the previous session logs.

<!-- write-log: session-log-index -->

| Date | Type | File | Summary |
|------|------|------|---------|
| 2026-05-26 | slice | [20260526-slice-3-sqlite-data-layer-and-fleet-management-issue5_log.md](docs/devlog/20260526-slice-3-sqlite-data-layer-and-fleet-management-issue5_log.md) | SQLite data layer (7 tables) + vessel CRUD (6 Tauri commands, 15 tests) + Fleet 3-col UI + VesselCard + AddVesselDialog (287 total tests) |
| 2026-05-23 | issue | [20260523-fix-blank-window-after-issue4-chrome-implementation_issue4_log.md](docs/devlog/20260523-fix-blank-window-after-issue4-chrome-implementation_issue4_log.md) | Fixed blank window: Navigate context bug + duplicate .launcher grid + missing scroll containment (264 tests pass) |
| 2026-05-22 | slice | [20260522-slice-2-component-extraction-and-tdd-test-suite-issue3_log.md](docs/devlog/20260522-slice-2-component-extraction-and-tdd-test-suite-issue3_log.md) | BottomNavBar extraction + keyboard shortcuts (1–5) + WelcomeScreen cards + OverlayLayout shell + responsive tests (264 total) |

<!-- gitnexus:end -->
