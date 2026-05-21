# Bridge — Domain Glossary

> **Bridge** is a Pi-first desktop application (Tauri v2 + **SolidJS**) that serves as a mission control board for AI-assisted software development across multiple git projects.

## Core Concepts

| Term | Definition |
|------|------------|
| **Bridge** | The product. A Tauri v2 desktop app with nautical theming. You're the captain. |
| **Vessel** | A registered git project in Bridge's fleet. Each vessel maps to one local git repository on disk. |
| **Fleet** | The collection of all registered vessels. Shown in the left sidebar. |
| **Pi Session** | A single invocation of the Pi CLI, launched by Bridge for a specific vessel. Has a structured JSON mode and an interactive PTY mode. |
| **Crew** | The agents working on a vessel. In Pi-first Bridge, this means Pi sessions (one or more per vessel). |
| **Comms Deck** | The embedded terminal view showing live PTY output from interactive Pi sessions (xterm.js). |
| **Cargo** | Git diffs / changes for a vessel. Reviewed in the Cargo Panel before shipping. |
| **Set Sail ⚓** | The commit + push action. One-click ship with auto-generated conventional commit messages. |
| **Engine Room** | Configurable run/dev/test/build commands per vessel (non-interactive processes). |
| **Ship's Log** | The activity feed — global event timeline across all vessels. |
| **Helm** | Bridge's settings panel. Global defaults plus per-vessel configuration. |

## Architecture Terms

| Term | Definition |
|------|------------|
| **Pi JSON Mode** | `pi --mode json -p "prompt"` — structured JSONL event stream. **Primary mode.** Used for supervised skill runs (/tdd, /write-log, etc.) where you launch, watch, review, commit. |
| **Pi PTY Mode** | Interactive terminal session with Pi. Secondary mode for creative/exploratory work (PRDs, issues, brainstorming) requiring multi-turn conversation. |
| **Execution View** | Structured UI rendering Pi's event stream as turns, thinking bubbles, tool call cards, and metrics. |
| **Config Resolution Pipeline** | Global BridgeConfig → VesselPiConfig overrides → Launch-time overrides → final CLI args. |
| **Event Parser** | Rust module that reads Pi's JSONL stdout into typed `PiJsonEvent` enums. |
| **State Machine** | Pure-function reducer that applies events to an `ExecutionViewModel`. |
| **Session History Browser** | Email-client-like UI for browsing past Pi session files from disk. |
| **Cost Tracker** | Real-time and historical cost analytics powered by Pi's usage/cost fields. |

## Pi-Specific Terms

| Term | Definition |
|------|------------|
| **Turn** | One round of user message → Pi response (may include multiple tool calls). |
| **Tool Call** | Pi invoking a tool (read, write, edit, bash, grep, etc.). |
| **Thinking** | Pi's reasoning/reasoning_content streamed before the response. |
| **Session File** | `.jsonl` file on disk where Pi persists session data. Bridge uses `--session-dir` to store its sessions in an isolated directory (separate from Pi's default). |

## Status Enums

| Enum | Values |
|------|--------|
| VesselStatus | Idle, Running, Warning, Error |
| PiStatus | Queued, Starting, Idle, Thinking, RunningTool, StreamingText, Done, Error, Stopped |
| PiMode | Json, PtyInteractive |
| ToolPolicy | AllowAll, AllowList, Vec\<String\>, DenyList: Vec\<String\>, None |

## Release Phasing

| Phase | Code Name | Scope |
|--------|-----------|-------|
| v0.1 | Sea Trials | Fleet view, Pi JSON-mode launch + **execution view**, PTY terminal tab (secondary), git diff + commit+push, basic config |
| v0.2 | Sonar | Session history browser, cost tracking dashboard, per-vessel config system |
| v0.3 | Captain's Log | Advanced features: budgets with auto-stop, forecasts, session export, fork/resume workflows |

## What Bridge Is NOT

- Bridge is NOT a generic terminal multiplexer (that's tmux)
- Bridge is NOT a code editor (that's VS Code / Cursor)
- Bridge is NOT a generic agent dashboard (Claude Code/Codex/Cursor CLI are NOT first-class citizens)
- Bridge is NOT a web application (it's Tauri desktop-only for MVP)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent | Pi-only | Structured event stream enables execution visualization, cost tracking, session history |
| Primary mode | JSON mode | User workflow is skill-based fire-and-forget (/tdd → review → commit) |
| Secondary mode | PTY terminal | For multi-turn creative work (PRDs, issues, brainstorming) |
| Session storage | Isolated dir | Bridge uses `--session-dir` to own its session universe |
| Phasing | v0.1/v0.2/v0.3 | Execution view in v0.1 since it's the primary experience |
| Post-session flow | Auto-transition | When Pi session ends, auto-show review+ship with pre-loaded diff and auto-generated commit message |
| Frontend | SolidJS | Fine-grained reactivity for real-time streaming execution view. Deep dive code samples are Svelte-pseudocode; actual impl uses SolidJS signals. |
| Data layer | SQLite + sqlx | Single DB for vessels, config, sessions, costs. sqlx abstraction allows Postgres migration later if needed. |
| Metaphor | Full nautical | Commit to the bit. Bridge, Vessel, Fleet, Cargo, Set Sail, Comms Deck, Engine Room, Helm, Ship's Log. |
| Error handling (v0.1) | Core safety net | Pre-flight binary check, session result card (success/error + metrics), one-click retry, git conflict pre-commit warning. |
