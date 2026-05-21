---
stepsCompleted: [1, 2]
inputDocuments:
  - "YouTube: 'I Built the ADE Tool I Actually Wanted' - Web Dev Cody (agentsystem.dev)"
  - "https://agentsystem.dev/downloads - Mission Control product page"
session_topic: 'Bridge — Nautical Mission Control Board (Tauri v2)'
session_goals: 'Design Bridge: a multi-project agentic development command center with nautical theme, MVP killer features + radical differentiators'
selected_approach: 'ai-recommended + progressive'
techniques_used: ['divergent ideation', 'feature clustering', 'competitive analysis', 'metaphor mapping']
ideas_generated: 42
context_file: ''
name: 'Bridge'
tagline: 'Command Your Fleet'
form_factor: 'Tauri v2 Desktop App'
theme: 'Nautical / Bridge of a ship'
date: 2026-05-21-1545
---

# Brainstorming Session Results

**Facilitator:** Session Facilitator
**Date:** 2026-05-21-1545

## Session Overview

**Topic:** 🚢 **Bridge** — Nautical Mission Control Board (Tauri v2)
**Goals:** Design a multi-project agentic development command center inspired by [Mission Control by Web Dev Cody](https://agentsystem.dev), but with original improvements, nautical theming, and open-core positioning.

### Context Guidance

**Source Material — Mission Control (v0.30.0):**
- Centralized desktop dashboard for managing multiple coding projects
- Each project card shows: project name, git status, running agent sessions (Claude Code / Codex / Cursor CLI)
- Live terminal sessions embedded per project
- Git diff viewer with tree view + accept/reject/ship (commit+push)
- Custom launch commands (up to 5) per project for local dev servers
- Themes (minimal + original), zoom in/out
- Philosophy: "Stop editing files — agents code, you review & ship"
- Electron app, $79 Pro (unlimited projects), Lite free (2 projects)

**Key Pain Point Solved:** Juggling multiple terminal windows across projects is chaotic. No single pane of glass to see what every agent is doing, review diffs, and ship code.

### Session Setup

- **Approach:** Inspired clone+ with nautical metaphor throughout
- **Form Factor:** Tauri v2 Desktop App (~10MB vs Electron's ~225MB)
- **Mode:** Open exploration → structured feature tiers
- **Name:** Bridge / Tagline: "Command Your Fleet"

---

# 🚢 BRIDGE — Product Vision

## Name & Metaphor

**Bridge** — You're the captain. Each project is a **vessel** in your fleet.
Agents are your **crew**. Diffs are **cargo manifests** to inspect before departure.
Shipping code is literally **setting sail**. 🌊⚓️

---

## ARCHITECTURE: Tauri v2 + Rust Backend + WebView Frontend

```
┌─────────────────────────────────────────────┐
│              Tauri WebView (Frontend)        │
│  ┌─────────── ┌──────────┐ ┌──────────────┐  │
│  │ Fleet View │ Vessel   │ Cargo/Diff    │  │
│  │ (projects) │ Panel    │ Review Panel  │  │
│  │           │ (agent+  │              │  │
│  │           │ terminal) │              │  │
│  └─────────── └──────────┘ └──────────────┘  │
│  ┌───────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Activity   │ Helm      │ Charts        │  │
│  │ Feed       │ (controls)│ (widgets)     │  │
│  └───────────┘ └──────────┘ └──────────────┘  │
├─────────────────────────────────────────────┤
│            Tauri Core (Rust)                 │
│  · Process manager (agent shells)             │
│  · Git operations (libgit2)                  │
│  · File watcher + context bus               │
│  · Plugin system (wasm / IPC)               │
│  · Secret vault (keyring)                    │
│  · Scheduler (cron-like)                     │
├─────────────────────────────────────────────┤
│         OS Layer                             │
│  · Shell sessions (pty)                      │
│  · File system                              │
│  · System notifications                     │
│  · Keychain access                          │
└─────────────────────────────────────────────┘
```

---

## THE FLEET VIEW (Main Dashboard)

### Layout: Your Bridge

```
 ,─────────────────────────────────────────────────────────────────────────────────,
 │  ⚓ BRIDGE                    ◉ All Systems Nominal    [🌙] [🔔] [⚙️]     │
 │  ─────────────────────────────────────────────────────────────────────────── │
 │                                                                                  │
 │  ┌─ FLEET ──────────────────┐  ┌─ ACTIVE VESSEL: web-dev-cody ──────────────┐  │
 │  │                           │  │                                           │  │
 │  │  🚢 web-dev-cody    ●run   │  │  ┌─ CREW (Agents) ──────────────────────┐  │  │
 │  │     main │ 3 files changed │  │  │ 🔵 Claude Code  › Adding about route.. │  │  │
 │  │                           │  │  │ ⚪ Codex (idle)                       │  │  │
 │  │  🚢 auth-service    idle   │  │  └───────────────────────────────────────┘  │  │
 │  │     main │ clean           │  │                                           │  │
 │  │                           │  │  ┌─ CARGO MANIFEST (Diff Review) ────────┐  │  │
 │  │  🚢 mobile-app      ⚠test  │  │  │ 📦 src/routes/about.tsx    +42  NEW   │  │  │
 │  │     feat/auth │ 1 broken   │  │  │ 📦 src/components/Header.tsx  ±8 MODIFY│  │  │
 │  │                           │  │  │ ☐ No secrets leaked  ☐ No console.log │  │  │
 │  │  🚢 infra           idle   │  │  │ Risk: 🟢 Low  │  AI: "Adds about page" │  │  │
 │  │     main │ deployed       │  │  │          [⚓ Set Sail] [✏ Edit]        │  │  │
 │  │                           │  │  └───────────────────────────────────────┘  │  │
 │  └───────────────────────────┘  └───────────────────────────────────────────┘  │
 │                                                                                  │
 │  ┌─ ACTIVITY FEED (Ship's Log) ─────────────────────────────────────────────── ┐  │
 │  │ 14:32 🚢 web-dev-cody: Claude Code produced 3 file changes                  │  │
 │  │ 14:28 🚢 mobile-app: Test run failed — AuthContext.tsx:42                   │  │
 │  │ 14:15 ⚓ auth-service: Set sail — pushed 2 commits to main                 │  │
 │  │ 14:00 🚢 infra: Deploy completed — production stable                       │  │
 │  └─────────────────────────────────────────────────────────────────────────── ┘  │
 │                                                                                  │
 │  [📋 Journal] [📊 Charts] [🔌 Plugins] [🧭 Navigate]                            │
 `─────────────────────────────────────────────────────────────────────────────────´
```

---

## FEATURE TIERS

### Tier 1 — Core (MVP / Free & Open Source)

| Feature | Nautical Name | What It Does |
|---------|---------------|-------------|
| Project Hub | **Fleet View** | All repos as vessels. Status badges, git branch, activity indicator |
| Agent Sessions | **Crew Quarters** | Launch Claude Code / Codex / Cursor CLI per vessel |
| Embedded Terminals | **Station Log** | PTY output per agent session, scrollable, searchable |
| Git Diff Review | **Cargo Manifest** | Tree-view diff per vessel, hunk-level accept/reject |
| Ship (Commit+Push) | **Set Sail ⚓** | One-click commit + push with auto-generated message |
| Launch Commands | **Engine Room** | Up to 5 configurable commands per vessel (dev, test, build, lint, deploy) |
| Activity Feed | **Ship's Log** | Global timeline of events across all vessels |
| Themes | **Bridge Lights** | Dark bridge (default), light harbor, midnight blue, green radar |

### Tier 2 — Captain's Tools (Pro)

| Feature | Nautical Name | What It Does |
|---------|---------------|-------------|
| Multi-Agent Per Vessel | **Full Crew** | Run multiple agents simultaneously in one project |
| AI Diff Summary | **Cargo Scanner** | One-sentence summary + risk assessment before deep review |
| Risk-Gated Sail | **Inspection Bay** | Pre-commit checks: secrets, console.logs, test coverage, breaking changes |
| Smart Ship Pipelines | **Voyage Planner** | Post-commit workflows: test → lint → PR → notify |
| Project Journals | **Captain's Log** | Auto-generated daily markdown log per vessel |
| Intent-Based Launch | **Helm Orders** | Type what you want ("add dark mode"), system picks agent + prompt |
| Agent Scorecards | **Crew Reports** | Metrics per agent: acceptance rate, tokens, time-to-ship |
| Tiling Layouts | **Bridge Config** | Drag-resize panels, save layouts per vessel |
| Scheduled Runs | **Night Watch** | Cron-like scheduled agent tasks |
| Environment Vault | **Safe** | Built-in .env management, leak prevention, keyring sync |

### Tier 3 — Admiral's Command (Future / Wild)

| Feature | Nautical Name | What It Does |
|---------|---------------|-------------|
| Radar/Status Board | **Sonar Map** | Real-time waveform visualization of all fleet activity |
| Mixer/Fader Board | **Sound Bridge** | Faders per vessel for focus/mute/priority control |
| Dependency Graph | **Sea Charts** | Visualize inter-project dependencies, monorepo topology |
| Pair Control Mode | **Joint Command** | Two captains share one Bridge in real-time |
| Web Companion Dashboard | **Fleet Tracking** | Read-only stakeholder view of fleet status |
| Plugin Marketplace | **Dry Dock** | Community plugins for Jira, Discord, Vercel, custom panels |
| Template Marketplace | **Shipyard** | Pre-configured vessel templates (SaaS starter, API, mobile) |
| Diff Time Travel | **Black Box Recorder** | Trace any line back to which agent/session introduced it |
| Bi-Directional Diff Chat | **Radio to Crew** | Ask agent "why did you do this?" directly from diff view |
| Live UI Preview | **Spyglass** | Render frontend changes side-by-side from diff |
| Kanban Columns | **Dock Schedule** | Move vessels through: Idle → Running → Review → Shipped |

---

## COMPETITIVE POSITIONING vs MISSION CONTROL

| Dimension | Mission Control | Bridge (Our Take) |
|-----------|---------------|-------------------|
| Price | $79 one-time (Lite: 2 proj) | Open core: free (unlimited), Pro for advanced |
| Tech | Electron (~225MB) | Tauri v2 (~10MB), Rust backend |
| Agents per project | 1 | Multiple (full crew) |
| Diff review | Tree view + accept/reject | AI summary + risk gating + bi-directional chat |
| Ship workflow | Commit + push | Configurable pipelines (voyage planner) |
| Activity awareness | Per-terminal only | Global feed + sonar map + health scores |
| Extensibility | None | Plugin system (dry dock) from day one |
| Philosophy | "Stop editing files" | "Command your fleet" |
| Theme | 2 options | Nautical theme system + custom CSS |
| Metadata | Basic | Journals, scorecards, charts, time travel |
| Open source | No | Yes (core) |

---

## MONETIZATION

- **Free (Open Source):** Fleet view, single agent per vessel, basic diff review, set sail, engine room, ship's log feed
- **Pro ($49-69 one-time):** Full crew, cargo scanner, inspection bay, voyage planner, captain's log, helm orders, night watch, safe, tiling
- **Team (future):** Joint command, fleet tracking (web dashboard), shared plugins, fleet-wide billing

> Rationale: Undercut Mission Control's $79 with better value, open source core builds community trust

---

## TECHNICAL STACK

| Layer | Choice | Why |
|-------|--------|-----|
| Shell | Tauri v2 | Rust backend, tiny binary, secure IPC, WRY webview |
| Frontend | TBD (SvelteKit/SolidJS/React+TS) | Tauri-friendly, reactive |
| Styling | Tailwind CSS v4 | Rapid prototyping, design system, nautical tokens |
| Terminal | xterm.js + pty | Gold standard for embedded terminals |
| Git | git2 (Rust) or git CLI | Native speed |
| AI/LLM | Provider-agnostic | For diff summaries, risk analysis, intent parsing |
| Plugin System | WASM plugins / IPC | Secure sandboxed extensions |
| Data Storage | SQLite (rusqlite) | Journals, config, metrics, caches |
| Updates | Tauri updater | Built-in update mechanism |

---

## NAVIGATIONAL LEXICON (Complete)

| Concept | Term | Used In |
|----------|------|--------|
| Projects | **Vessels** | Fleet view, project cards |
| Agents | **Crew** | Agent session panel |
| Terminal Output | **Station Log** | Embedded terminal |
| Diffs / Changes | **Cargo** | Diff review panel |
| Commit + Push | **Set Sail ⚓** | Ship button |
| Run Commands | **Engine Room** | Launch command config |
| Activity Timeline | **Ship's Log** | Activity feed |
| Settings | **Helm** | Settings panel |
| Plugins | **Dry Dock** | Extension marketplace |
| Templates | **Shipyard** | Project templates |
| Health/Metrics | **Charts** | Dashboard widgets |
| Scheduled Tasks | **Night Watch** | Cron scheduler |
| Secrets/Env | **Safe** | Environment vault |
| Risk Analysis | **Inspection Bay** | Pre-commit gates |
| AI Summary | **Cargo Scanner** | Diff intelligence |
| Workflows | **Voyage Plans** | Ship pipelines |
| Layouts | **Bridge Config** | Panel arrangements |
| Paused State | **Anchored ⚓** | Checkpointed sessions |
| Errors/Storms | **Rough Seas** | Error states |
| Pair Mode | **Joint Command** | Two-person control |
| Web Dashboard | **Fleet Tracking** | Stakeholder view |
| Dependencies | **Sea Charts** | Graph visualization |
| Performance Stats | **Crew Reports** | Agent metrics |
