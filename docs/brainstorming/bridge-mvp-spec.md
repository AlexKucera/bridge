# 🔨 Bridge MVP Feature Specification

> **Status:** UI Prototype complete (Monokai Pro theme) ✅
> **Framework:** SvelteKit
> **Platform:** macOS (primary)
> **Name:** Bridge ⚓
> **Next:** Technical implementation — Tauri v2 + Rust + SvelteKit

---

## MVP SCOPE (v0.1 — "Sea Trials")

**Goal:** A working desktop app where you can add git projects, launch agent sessions (Claude Code / Codex), see terminal output, review diffs, and commit+push — all from one window.

### What's IN for MVP

| # | Feature | Priority | Effort | Notes |
|---|---------|----------|--------|------|
| F1 | **Vessel (Project) Management** | P0 | Medium | Add/remove local git repos |
| F2 | **Fleet View (Sidebar)** | P0 | Low | Vessel cards with git status, branch, health |
| F3 | **Agent Session Launcher** | P0 | Medium | Spawn Claude Code/Codex/Cursor CLI per vessel |
| F4 | **Embedded Terminal (Station Log)** | P0 | High | xterm.js + PTY per agent session |
| F5 | **Git Diff Viewer (Cargo Manifest)** | P0 | High | Tree-view file list + hunk-level diff display |
| F6 | **Commit & Push (Set Sail ⚓)** | P0 | Medium | One-click with auto-generated conventional commit message |
| F7 | **Launch Commands (Engine Room)** | P1 | Low | Configurable run/dev/test/build commands per vessel |
| F8 | **Activity Feed (Ship's Log)** | P1 | Low | Global event timeline across all vessels |
| F9 | **Settings / Helm 🧰** | P1 | Medium | Agent binary paths, theme, git config |
| F10 | **Monokai Pro Theme** | P0 | ✅ Done | Warm charcoal palette |

### What's OUT for MVP (v0.2+)

- Multi-agent per vessel (Full Crew)
- AI Diff Summary (Cargo Scanner) — needs LLM API key management
- Risk-Gated Sail (Inspection Bay)
- Smart Ship Pipelines (Voyage Planner)
- Captain's Log (Journal) — auto-generated daily markdown
- Intent-Based Launch (Helm Orders)
- Plugin System (Dry Dock)
- Charts Dashboard
- Night Watch (scheduler)
- Environment Vault (Safe)
- Tiling layouts
- Pair Control Mode

---

## TECHNICAL ARCHITECTURE

### Project Structure

```
bridge/
├── src-tauri/                    # Rust backend (Tauri v2)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs               # Entry, app setup, Tauri command registration
│       ├── fleet.rs              # Vessel CRUD, status refresh, file watching
│       ├── agent.rs              # Session lifecycle: spawn, monitor, kill, PTY
│       ├── terminal.rs           # PTY bridge: resize, read, write
│       ├── git.rs                # Git operations via CLI or gix
│       ├── config.rs             # Settings persistence (SQLite/json)
│       ├── commands.rs           # Engine room launch command runner
│       └── events.rs             # Event bus: Rust → JS via Tauri emit()
├── src/                          # Frontend
│   ├── main.tsx                  # App shell, layout grid
│   ├── lib/
│   │   ├── components/
│   │   │   ├── FleetView.svelte      # Left sidebar: vessel list + search
│   │   │   ├── VesselPanel.svelte    # Center: crew/log/engine tabs
│   │   │   ├── CargoPanel.svelte     # Right: diff review + sail button
│   │   │   ├── FeedPanel.svelte       # Bottom: activity feed
│   │   │   ├── Terminal.svelte        # xterm.js PTY renderer
│   │   │   ├── DiffViewer.svelte      # Git diff hunk renderer
│   │   │   └── Settings.svelte        # Helm: config panel
│   │   ├── stores/
│   │   │   ├── fleet.ts              # Vessel state (Svelte store / signals)
│   │   │   ├── agents.ts             # Active agent sessions
│   │   │   ├── git.ts                # Diff data, staging state
│   │   │   └── feed.ts               # Activity log entries
│   │   └── utils/
│   │       ├── nautical.ts           # Naming helpers (vessel→🚢 etc.)
│   │       └── monokai.ts            # CSS custom properties
│   ├── styles/
│   │   └── monokai-pro.css           # Complete theme stylesheet
│   └── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

### Rust Backend Detail

#### F1: Vessel Management — `fleet.rs`

```rust
pub struct Vessel {
    pub id: Uuid,
    pub name: String,                 // "web-dev-cody"
    pub path: PathBuf,                // absolute path to git repo root
    pub branch: String,               // current git branch name
    pub status: VesselStatus,          // Idle | Running | Warning | Error
    pub changed_files: u32,            // unstaged + staged change count
    pub health: u8,                    // 0-100 composite score
    pub last_activity: Option<DateTime<Utc>>,
    pub tags: Vec<String>,             // user tags: #frontend #client
    pub launch_commands: Vec<LaunchCommand>,  // engine room config
}

pub struct LaunchCommand {
    pub name: String,     // "Dev Server"
    pub command: String,  // "npm run dev"
}

pub enum VesselStatus { Idle, Running, Warning, Error }
```

**Commands (exposed to frontend via Tauri):**
- `fleet_add(path: String) -> Result<Vessel>` — validate `.git` exists, register
- `fleet_list() -> Vec<Vessel>` — all registered vessels with current status
- `fleet_remove(id: Uuid) -> Result<()>`
- `fleet_refresh(id: Uuid) -> Result<Vessel>` — re-read git status
- `fleet_scan_status() -> Vec<VesselStatusEvent>` — batch refresh all
- `fleet_set_commands(id: Uuid, cmds: Vec<LaunchCommand>) -> Result<()>`
- `fleet_add_tag(id: Uuid, tag: String) -> Result<()>`
- `fleet_open_in_finder(id: Uuid) -> Result<()>` — open folder in OS file manager
- `fleet_open_in_terminal(id: Uuid) -> Result<()>` — open external terminal at path

**Persistence:** SQLite via `rusqlite` — table `vessels` with JSON columns for commands/tags.

#### F3: Agent Lifecycle — `agent.rs`

```rust
pub struct AgentSession {
    pub id: Uuid,
    pub vessel_id: Uuid,
    pub agent_type: AgentType,
    pub pty: Option<MasterPty>,
    pub child: Option<Child>,
    pub status: AgentStatus,
    pub started_at: DateTime<Utc>,
}

pub enum AgentType { ClaudeCode, Codex, CursorCli }
pub enum AgentStatus { Starting, Idle, Running, Done, Error, Stopped }
```

**Commands:**
- `agent_start(vessel_id: Uuid, agent: AgentType, prompt: Option<String>) -> Result<Uuid>`
  - Look up binary path from settings config
  - Create PTY with `portable-pty` (size: 80x24 default)
  - Spawn: `Command::new(binary).current_dir(vessel_path).stdin(pty.take().unwrap())...`
  - Start output polling loop in background thread
  - Emit events: `agent-output { session_id, data }`, `agent-status-changed { session_id, status }`
- `agent_write(session_id: Uuid, data: Vec<u8>) -> Result<()>` — send keystrokes to PTY
- `agent_resize(session_id: Uuid, cols: u16, rows: u16) -> Result<()>` — resize PTY
- `agent_stop(session_id: Uuid) -> Result<()>` — graceful SIGTERM, force SIGKILL after 3s
- `agent_list() -> Vec<AgentSession>`
- `agent_list_for_vessel(vessel_id: Uuid) -> Vec<AgentSession>`

**Output polling strategy:**
- Background thread per session (or single thread with epoll/kqueue multiplexing)
- Read from PTY master in 4KB chunks
- Throttle emits to frontend at ~60fps max
- Ring buffer of last 2MB for scrollback

#### F5: Git Operations — `git.rs`

```rust
pub struct DiffResult {
    pub files: Vec<DiffFile>,
    pub stats: DiffStats { added: u32, modified: u32, deleted: u32 },
}

pub struct DiffFile {
    pub path: String,              // "src/components/Header.tsx"
    pub status: FileStatus,         // Added | Modified | Deleted | Renamed
    pub additions: u32,
    pub deletions: u32,
    pub hunks: String,              // raw unified diff text for this file
}

pub struct CommitResult {
    pub hash: String,
    pub message: String,
    pub branch: String,
    pub files_count: u32,
}
```

**Commands:**
- `git_diff(vessel_id: Uuid, staged: bool) -> Result<DiffResult>`
  - Run `git diff --numstat --stat` for stats
  - Run `git diff --name-status` for file list
  - Run `git diff` (or `--cached`) for full diff text
  - Parse into `DiffResult` struct
- `git_file_diff(vessel_id: Uuid, path: String) -> Result<String>` — single file
- `git_stage_all(vessel_id: Uuid) -> Result<()>` — `git add -A`
- `git_stage_file(vessel_id: Uuid, path: String) -> Result<()>`
- `git_unstage_file(vessel_id: Uuid, path: String) -> Result<()>`
- `git_commit(vessel_id: Uuid, message: Option<String>) -> Result<CommitResult>`
  - Auto-generate message if None: parse diff → conventional commit format
  - e.g., `feat: add about route and header link (3 files)`
- `git_push(vessel_id: Uuid, remote: Option<String>) -> Result<PushResult>`
- `git_status(vessel_id: Uuid) -> Result<GitStatus>` — clean/dirty/ahead/behind/stash
- `git_branches(vessel_id: Uuid) -> Result<Vec<String>>` — local branches
- `git_checkout(vessel_id: Uuid, branch: String) -> Result<()>`

**MVP decision: Shell out to `git` CLI.** Pure Rust `gix` is powerful but complex. Shell out is simpler and faster to implement. Wrap errors cleanly.

#### F6: Set Sail Flow (Frontend-Orchestrated)

```
User clicks ⚓ Set Sail
  │
  ├─ 1. Frontend calls git_commit(vessel_id, optional_custom_message)
  │     └─ Rust stages all → generates/uses message → commits → returns CommitResult
  │
  ├─ 2. On success: animate button → show commit hash
  │
  ├─ 3. Frontend calls git_push(vessel_id)
  │     └─ Rust runs git push → returns PushResult
  │
  ├─ 4. On push success:
  │     ├─ Show shipped animation
  │     ├─ Emit feed event: "⚓ vessel-name: Set sail — pushed N commits"
  │     └─ Refresh vessel status (back to clean)
  │
  └─ 5. On failure at any step:
       └─ Show error in button, revert to original state, show error toast
```

#### F7: Engine Room — `commands.rs`

```rust
pub struct RunningCommand {
    pub id: Uuid,
    pub vessel_id: Uuid,
    pub name: String,          // "Dev Server"
    pub command: String,       // "npm run dev"
    pub child: Option<Child>,
    pub started_at: DateTime<Utc>,
    pub status: CommandStatus, // Running | Stopped | Failed
    pub port: Option<u16>,     // detected if command mentions a port
}
```

**Commands:**
- `cmd_start(vessel_id: Uuid, command_idx: usize) -> Result<Uuid>` — run the Nth configured command
- `cmd_stop(id: Uuid) -> Result<()>`
- `cmd_list_running() -> Vec<RunningCommand>`
- `cmd_read_output(id: Uuid) -> Result<Vec<u8>>` — read stdout/stderr

**Key difference from agent sessions:** These are simpler — no PTY needed (output goes to a log buffer, not interactive terminal). Good for dev servers, test runners, etc.

#### F8: Activity Feed — `events.rs`

Events are emitted by all other modules and collected here:

```rust
pub struct FeedEntry {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub vessel_id: Option<Uuid>,     // Some events are global (system)
    pub event_type: FeedEventType,
    pub title: String,               // "Claude Code produced 3 changes"
    pub detail: Option<String>,      // Optional extra info
    pub icon: String,                // "👤" "⚓" "⚠️" "🚀"
    pub tag: Option<FeedTag>,        // Agent | Shipped | Error | Deploy | System
}

pub enum FeedEventType {
    AgentStarted, AgentOutput, AgentStopped, AgentError,
    DiffReady, ShipSuccess, ShipFailed,
    CommandStarted, CommandStopped, CommandError,
    VesselAdded, VesselRemoved, VesselWarning,
    SystemNote,
}

pub enum FeedTag { Agent, Shipped, Error, Deploy, System }
```

**Commands:**
- `feed_recent(limit: usize) -> Vec<FeedEntry>` — last N events across all vessels
- `feed_for_vessel(vessel_id: Uuid, limit: usize) -> Vec<FeedEntry>`
- `feed_clear() -> Result<()>`
- Events also pushed proactively via Tauri `emit("feed-event", entry)` for real-time updates

#### F9: Settings / Config — `config.rs`

```rust
pub struct BridgeConfig {
    // Agent binaries
    pub claude_code_path: String,     // "/usr/local/bin/claude"
    pub codex_path: String,           // "/usr/local/bin/codex"
    pub cursor_cli_path: String,      // "/usr/local/bin/cursor"

    // Git
    pub git_user_name: Option<String>,
    pub git_user_email: Option<String>,

    // Behavior
    pub auto_refresh_seconds: u32,    // Status poll interval (default: 10)
    pub terminal_scrollback: usize,    // Lines of history (default: 10000)
    pub max_terminal_sessions: usize,  // Per vessel (default: 5)

    // Theme
    pub theme: ThemeChoice,            // MonokaiPro (only option for MVP)

    // Window
    pub remember_window_geometry: bool,
    pub start_minimized: bool,
}
```

**Commands:**
- `config_get() -> BridgeConfig`
- `config_update(partial: Partial<BridgeConfig>) -> Result<()>`
- `config_reset() -> Result<()>` — restore defaults
- Persisted as JSON file in app data dir (`~/.config/bridge/config.json` on macOS/Linux, `%APPDATA%` on Windows)

---

## FRONTEND ARCHITECTURE

### State Management

Using **Svelte 5 runes** (signals) or **SolidJS signals** — reactive, lightweight, no virtual DOM overhead:

```
┌─────────────────────────────────────────────┐
│                   App State                   │
│                                                 │
│  vessels: Signal<VesselMap>                    │
│  activeVessel: Signal<Uuid | null>             │
│  sessions: Signal<Map<Uuid, AgentSession>>     │
│  diffData: Signal<DiffResult | null>          │
│  feedEntries: Signal<FeedEntry[]>             │
│  config: Signal<BridgeConfig>                 │
│  activeTab: Signal<'crew' | 'log' | 'engine'> │
│  overlayView: Signal<string | null>           │
└─────────────────────────────────────────────┘
         │ invoke │ listen │ emit
         ▼         ▼         ▼
┌─────────────────────────────────────────────┐
│              Tauri IPC Bridge                │
│  invoke('fleet_list')  →  Rust returns data  │
│  listen('agent-output') ←  Rust pushes events │
│  emit('terminal-write')  →  Rust writes PTY   │
└─────────────────────────────────────────────┘
```

### Component Hierarchy

```
<App>
├── <TitleBar />                     <!-- Custom frameless title bar -->
├── <BridgeLayout>
│   ├── <FleetView />               <!-- Left sidebar -->
│   │   ├── <SearchInput />
│   │   └── <VesselCard />[]         <!-- Clickable, shows status badge -->
│   │   └── <AddVesselButton />
│   │
│   ├── <VesselPanel />              <!-- Center panel -->
│   │   ├── <VesselHeader />         <!-- Icon + name + path -->
│   │   ├── <TabBar />              <!-- Crew | Station Log | Engine Room -->
│   │   ├── <CrewView />            <!-- Tab: Agent session cards -->
│   │   │   └── <CrewMemberCard />  <!-- Avatar + status + controls -->
│   │   ├── <StationLog />          <!-- Tab: xterm.js terminal -->
│   │   └── <EngineRoom />          <!-- Tab: Launch command buttons -->
│   │       └── <EngineCommand />   <!-- Name + detail + play btn -->
│   │
│   ├── <CargoPanel />              <!-- Right sidebar -->
│   │   ├── <CargoStats />          <!-- +N ±M -D counters -->
│   │   ├── <AIScanner />           <!-- AI summary placeholder -->
│   │   ├── <CargoFileList />       <!-- Scrollable file list -->
│   │   │   └── <CargoFileRow />    <!-- Clickable → expands diff -->
│   │   ├── <DiffDetail />          <!-- Expandable diff hunks -->
│   │   └── <SailArea />            <!-- ⚓ Set Sail button + secondary -->
│   │
│   └── <FeedPanel />               <!-- Bottom: activity timeline -->
│       └── <FeedItem />[]
│
├── <BottomNav />                   <!-- Journal | Charts | Dry Dock | Helm -->
└── <OverlayViews />                <!-- Full-screen overlays (hidden by default) -->
    ├── <CaptainLog />              <!-- Journal view -->
    ├── <ChartsDashboard />         <!-- Metrics view -->
    ├── <DryDock />                 <!-- Plugins placeholder -->
    └── <HelmSettings />            <!-- Settings form -->
```

### Terminal Integration (xterm.js)

```typescript
// Terminal.svelte — core integration
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

let term: Terminal;
let fit: FitAddon;

onMount(async () => {
  term = newTerminal({
    theme: monokaiProTheme,        // Our extracted color map
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12,
    lineHeight: 1.55,
    cursorBlink: true,
    allowProposedApi: true,
  });
  fit = new FitAddon();
  loadAddon(fit);

  // Listen for Rust-side output
  await listen<Uint8Array>('agent-output', (event) => {
    if (event.payload.sessionId === props.sessionId) {
      term.write(event.payload.data);  // Push bytes to xterm
    }
  });

  // Send keystrokes to Rust
  term.onData((data) => {
    invoke('agent_write', {
      sessionId: props.sessionId,
      data: new TextEncoder().encode(data),
    });
  });

  // Handle resize
  window.addEventListener('resize', () => fit.fit());
});
```

### Diff Viewer Approach

For the MVP, render diffs as styled `<pre>` blocks (not a full Monaco editor):

```svelte
<!-- DiffViewer.svelte -->
<div class="diff-hunk-header">@@ -{h.old_start},{h.old_lines} +{h.new_start},{h.new_lines} @@</div>
{#each hunk.lines as line}
  {@const cls = line.type === 'add' ? 'diff-add'
              : line.type === 'remove' ? 'diff-remove'
              : 'diff-context'}
  <span class={cls}>{line.prefix}{line.content}</span>
{/each}
```

Future v0.2: Replace with Monaco Editor for full editing capability.

---

## CRATE DEPENDENCIES (Rust)

| Crate | Purpose | Why |
|-------|---------|-----|
| `tauri` v2 | Desktop shell | Core framework |
| `tauri-plugin-shell` | Shell operations | Open finder, external terminals |
| `portable-pty` | PTY creation/management | Cross-platform pseudo-terminals |
| `serde` / `serde_json` | Serialization | IPC payload types |
| `rusqlite` | Embedded DB | Vessel registry, settings, feed history |
| `tokio` | Async runtime | Background polling threads |
| `notify` | File watcher | Detect git changes in vessel dirs |
| `uuid` | ID generation | Vessel/session/event IDs |
| `chrono` | Datetimes | Timestamps everywhere |
| `thiserror` | Error types | Clean error handling |
| `log` / `env_logger` | Logging | Debug diagnostics |
| `dirs` | Platform paths | App data directory resolution |
| `regex` | Diff parsing | Extract hunks from git output |

## NPM DEPENDENCIES (Frontend)

| Package | Purpose |
|---------|---------|
| SvelteKit 2+ (or SolidJS) | UI framework |
| TypeScript | Type safety |
| Tailwind CSS v4 | Utility styling (or just our monokai-pro.css) |
| `xterm` + `xterm-addon-fit` + `xterm-addon-web-links` | Terminal emulator |

---

## IMPLEMENTATION ORDER (Build Sequence)

### Phase 1: Skeleton (Day 1-2)
1. `cargo create-tauri-app bridge` — scaffold Tauri v2 project
2. Set up SvelteKit (or SolidJS) frontend in `src/`
3. Implement custom frameless window with title bar
4. Wire up basic 3-column grid layout (no real data yet)
5. Apply Monokai Pro CSS theme

### Phase 2: Fleet + Git (Day 3-4)
6. Implement `fleet.rs` — add/remove/list vessels, SQLite persistence
7. Implement `config.rs` — settings load/save
8. Implement `git.rs` — diff, status, stage, commit, push (shell out)
9. Build `FleetView.svelte` sidebar with real vessel cards
10. Build `CargoPanel.svelte` with real diff rendering

### Phase 3: Agents + Terminal (Day 5-7)
11. Implement `agent.rs` — PTY creation, process spawning, I/O
12. Implement `terminal.rs` — resize/read/write bridge
13. Build `Terminal.svelte` — xterm.js integration with PTY
14. Build `CrewView.svelte` — agent session cards + launch/stop
15. Build `Station Log tab` — terminal view inside vessel panel
16. Wire up keyboard input flow: user types → xterm → invoke → Rust PTY

### Phase 4: Ship It (Day 8-9)
17. Implement `Set Sail` flow — commit + push orchestration
18. Build `EngineRoom.svelte` — launch command runner
19. Implement `commands.rs` — non-interactive process runner
20. Implement `events.rs` + `FeedPanel.svelte` — activity timeline
21. Build `HelmSettings.svelte` — settings form wired to config.rs

### Phase 5: Polish (Day 10)
22. Add vessel open-in-finder / open-in-terminal
23. Keyboard shortcuts (Cmd+P quick switch, Cmd+N new vessel, etc.)
24. Error handling edge cases (repo deleted, git conflict, agent crash)
25. Auto-refresh vessel status on interval
26. Build + test on macOS, smoke test Linux/Windows

---

## OPEN QUESTIONS FOR USER

1. **Frontend framework preference?** SvelteKit (lighter, simpler reactivity) vs SolidJS (more performant, better for heavy apps)? Recommendation: **SvelteKit** for speed-to-MVP.
2. **Git: shell out or pure Rust?** Shell to `git` CLI is faster to build; `gix` crate is more robust but steeper learning curve. Recommendation: **Shell out for MVP**, add `gix` later.
3. **Multi-platform priority?** Target macOS first (you're on Mac), then Linux, then Windows?
4. **Distribution?** Homebrew cask? DMG downloads? AUR? Just local builds initially?
5. **Name finalization?** "Bridge" — happy with it, or want something else?
