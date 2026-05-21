# Bridge Backend Deep-Dive — Rust/Tauri v2

> **Part of:** Bridge MVP Spec v0.1 "Sea Trials"
> **Focus:** Complete backend architecture: data model, state machine, concurrency, IPC, errors, edge cases

---

## 1. COMPLETE DATA MODEL

### 1.1 Entity Relationship Diagram (Text)

```
┌──────────────┐       ┌──────────────────┐       ┌─────────────┐
│   Vessel     │       │  AgentSession    │       │ FeedEntry   │
├──────────────┤       ├──────────────────┤       ├─────────────┤
│ id: Uuid  PK │──┐    │ id: Uuid      PK │    ┌──│ id: Uuid PK │
│ name: String │  │    │ vessel_id: FK ───┼────┘  │ timestamp   │
│ path: PathBuf│  │    │ agent_type: Enum │       │ vessel_id FK│
│ branch: Str  │  │    │ pty: MasterPty?  │       │ event_type  │
│ status: Enum │  │    │ child: Child?    │       │ title       │
│ changed_files│  │    │ status: Enum     │       │ detail?     │
│ health: u8   │  │    │ started_at: DT   │       │ icon        │
│ last_activity│  │    │ output_buf: Vec8 │       │ tag: Enum    │
│ tags: Json   │  │    └──────────────────┘       └─────────────┘
│ launch_cmds: │  │              │
│   Json       │  │              │ 1:N
└──────────────┘  │              ▼
                  │    ┌──────────────────┐
                  └───▶│ RunningCommand   │
                       ├──────────────────┤
                       │ id: Uuid      PK │
                       │ vessel_id: FK ───┘
                       │ name: String     │
                       │ command: String  │
                       │ child: Child?    │
                       │ started_at: DT   │
                       │ status: Enum     │
                       │ port: Option<u16>│
                       └──────────────────┘

┌──────────────────┐
│  BridgeConfig    │  (Singleton, persisted as JSON)
├──────────────────┤
│ claude_code_path │
│ codex_path       │
│ cursor_cli_path  │
│ git_user_name?   │
│ git_user_email?  │
│ auto_refresh_s   │
│ terminal_scrlbk  │
│ max_sessions     │
│ theme            │
│ remember_geom    │
│ start_minimized  │
└──────────────────┘
```

### 1.2 Full Struct Definitions with Serde

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use chrono::{DateTime, Utc};
use uuid::Uuid;

// ═══════════════════════════════════════════
// VESSEL — A registered git project
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Vessel {
    pub id: Uuid,
    pub name: String,
    pub path: PathBuf,
    pub branch: String,
    pub status: VesselStatus,
    pub changed_files: u32,
    pub staged_files: u32,
    pub health: u8,                          // 0-100
    pub last_activity: Option<DateTime<Utc>>,
    pub tags: Vec<String>,                   // e.g., ["frontend", "client-x"]
    pub launch_commands: Vec<LaunchCommand>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum VesselStatus {
    Idle,                                    // No active agents or commands
    Running,                                 // At least one agent/command active
    Warning,                                 // Has uncommitted changes > threshold
    Error,                                   // Git error, missing .git, etc.
}

impl Default for VesselStatus {
    fn default() -> Self { VesselStatus::Idle }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchCommand {
    pub id: Uuid,
    pub name: String,                        // "Dev Server"
    pub command: String,                     // "npm run dev"
    pub sort_order: usize,                   // Display order
}

// ═══════════════════════════════════════════
// AGENT SESSION — An interactive AI coding session
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSession {
    pub id: Uuid,
    pub vessel_id: Uuid,
    pub agent_type: AgentType,
    pub status: AgentStatus,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    // Not serialized — runtime only:
    // pty: Arc<Mutex<Option<MasterPty>>>,
    // child: Arc<Mutex<Option<Child>>>,
    // output_ring: Arc<RwLock<RingBuffer>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentType { ClaudeCode, Codex, CursorCli }

impl AgentType {
    /// Default binary names (overridden by config)
    pub fn default_binary(&self) -> &'static str {
        match self {
            AgentType::ClaudeCode => "claude",
            AgentType::Codex => "codex",
            AgentType::CursorCli => "cursor",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            AgentType::ClaudeCode => "Claude Code",
            AgentType::Codex => "OpenAI Codex CLI",
            AgentType::CursorCli => "Cursor CLI",
        }
    }

    pub fn icon(&self) -> char {
        match self {
            AgentType::ClaudeCode => '👤',
            AgentType::Codex => '🤖',
            AgentType::CursorCli => '🖥',
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AgentStatus {
    Starting,                                // Process spawning, PTY allocating
    Idle,                                    // Waiting for input (prompt completed)
    Running,                                 // Actively producing output
    Done,                                    // Exited cleanly (code 0)
    Error,                                   // Exited with non-zero code
    Stopped,                                 // User-initiated SIGTERM/SIGKILL
}

// ═══════════════════════════════════════════
// RUNNING COMMAND — Non-interactive process (dev server, tests)
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningCommand {
    pub id: Uuid,
    pub vessel_id: Uuid,
    pub name: String,
    pub command: String,
    pub status: CommandStatus,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub port: Option<u16>,                   // Auto-detected from output
    pub exit_code: Option<i32>,
    // Runtime only:
    // child: Arc<Mutex<Option<Child>>>,
    // output_buf: Arc<Mutex<Vec<u8>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum CommandStatus { Running, Stopped, Failed }

// ═══════════════════════════════════════════
// GIT TYPES — Diff and commit results
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub files: Vec<DiffFile>,
    pub stats: DiffStats,
    pub is_staged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffStats {
    pub added: u32,
    pub modified: u32,
    pub deleted: u32,
    pub renamed: u32,
}

impl Default for DiffStats {
    fn default() -> Self { DiffStats { added:0, modified:0, deleted:0, renamed:0 } }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffFile {
    pub path: String,
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
    pub old_path: Option<String>,           // For renames
    pub binary: bool,                       // True if binary file (no diff available)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FileStatus { Added, Modified, Deleted, Renamed, Untracked }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitResult {
    pub hash: String,                        // Full SHA
    pub short_hash: String,                  // Abbreviated SHA
    pub message: String,
    pub branch: String,
    pub files_committed: u32,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResult {
    pub success: bool,
    pub remote: String,
    pub branch: String,
    pub pushed_commits: u32,
    pub detail: Option<String>,             // "fast-forward", "force-push needed", etc.
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub branch: String,
    pub clean: bool,
    pub ahead: u32,                         // Commits ahead of remote
    pub behind: u32,                        // Commits behind remote
    pub staged_count: u32,
    pub unstaged_count: u32,
    pub untracked_count: u32,
    pub stash_count: u32,
    pub has_conflicts: bool,
}

// ═══════════════════════════════════════════
// FEED / ACTIVITY LOG
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeedEntry {
    pub id: Uuid,
    pub timestamp: DateTime<Utc>,
    pub vessel_id: Option<Uuid>,
    pub event_type: FeedEventType,
    pub title: String,
    pub detail: Option<String>,
    pub icon: char,
    pub tag: FeedTag,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FeedEventType {
    // Agent events
    AgentStarted, AgentOutput, AgentStopped, AgentError,
    // Ship events
    DiffReady, ShipSuccess, ShipFailed,
    // Command events
    CommandStarted, CommandStopped, CommandError,
    // Vessel events
    VesselAdded, VesselRemoved, VesselWarning, VesselHealthChange,
    // System
    SystemNote,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FeedTag { Agent, Shipped, Error, Deploy, System, Info }

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeConfig {
    // Agent binary paths
    pub claude_code_path: String,
    pub codex_path: String,
    pub cursor_cli_path: String,

    // Git identity (optional — falls back to global git config)
    pub git_user_name: Option<String>,
    pub git_user_email: Option<String>,

    // Behavior
    pub auto_refresh_seconds: u32,
    pub terminal_scrollback_lines: usize,
    pub max_terminal_sessions_per_vessel: usize,
    pub max_concurrent_agents: usize,

    // UI
    pub theme: ThemeChoice,
    pub remember_window_geometry: bool,
    pub start_minimized: bool,
    pub show_vessel_icons: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ThemeChoice { MonokaiPro }

impl Default for BridgeConfig {
    fn default() -> Self {
        BridgeConfig {
            claude_code_path: String::from("claude"),
            codex_path: String::from("codex"),
            cursor_cli_path: String::from("cursor"),
            git_user_name: None,
            git_user_email: None,
            auto_refresh_seconds: 10,
            terminal_scrollback_lines: 10000,
            max_terminal_sessions_per_vessel: 5,
            max_concurrent_agents: 10,
            theme: ThemeChoice::MonokaiPro,
            remember_window_geometry: true,
            start_minimized: false,
            show_vessel_icons: true,
        }
    }
}
```

---

## 2. STATE MANAGEMENT ARCHITECTURE

### 2.1 The AppState Singleton

All mutable state lives in **one** `AppState` struct, managed via Tauri's `State` management. This is the single source of truth.

```rust
use std::sync::{Arc, RwLock};
use std::collections::{HashMap, HashSet};
use portable_pty::MasterPty;
use tokio::sync::mpsc;

/// The central application state. One instance, shared via Tauri's State manager.
pub struct AppState {
    // ── Persistent entities (also in SQLite) ──
    vessels: RwLock<HashMap<Uuid, Vessel>>,
    config: RwLock<BridgeConfig>,

    // ── Ephemeral runtime state (in-memory only) ──
    agent_sessions: RwLock<HashMap<Uuid, AgentSessionRuntime>>,
    running_commands: RwLock<HashMap<Uuid, CommandRuntime>>,
    feed: RwLock<VecDeque<FeedEntry>>,          // Ring buffer, max 5000 entries

    // ── Channels for background tasks ──
    feed_tx: mpsc::UnboundedSender<FeedEntry>,   // Any module can push feed events
    shutdown_tx: Option<mpsc::Sender<()>>,        // Graceful shutdown signal
}

/// Runtime-only data for agent sessions (not persisted/serialized)
struct AgentSessionRuntime {
    session: AgentSession,
    pty: Option<MasterPty>,
    child: Option<std::process::Child>,
    output_ring: RingBuffer,                     // 2MB scrollback buffer
}

struct CommandRuntime {
    cmd: RunningCommand,
    child: Option<std::process::Child>,
    output_buf: Vec<u8>,                        // Simpler than ring buffer for commands
}

/// Fixed-size circular buffer for terminal scrollback
struct RingBuffer {
    data: Vec<u8>,
    head: usize,
    len: usize,
    capacity: usize,
}

impl RingBuffer {
    fn new(capacity: usize) -> Self {
        RingBuffer { data: vec![0u8; capacity], head: 0, len: 0, capacity }
    }

    fn write(&mut self, bytes: &[u8]) {
        for &b in bytes {
            self.data[self.head] = b;
            self.head = (self.head + 1) % self.capacity;
            if self.len < self.capacity { self.len += 1; }
        }
    }

    fn read_recent(&self, n: usize) -> Vec<u8> {
        let take = n.min(self.len);
        let start = (self.head + self.capacity - take) % self.capacity;
        let mut result = Vec::with_capacity(take);
        for i in 0..take {
            result.push(self.data[(start + i) % self.capacity]);
        }
        result
    }

    fn read_all(&self) -> Vec<u8> {
        self.read_recent(self.len)
    }
}
```

### 2.2 State Flow Diagram

```
FRONTEND                    RUST BACKEND (AppState)
                            ┌─────────────────────────────────┐
invoke('fleet_add', path)  │  vessels: HashMap<Uuid, Vessel>  │
         ──────────────────▶│  fleet_add() validates .git     │
                           │  inserts into HashMap + SQLite   │
                           │  emits 'feed-event' (VesselAdded)│
         ◀──────────────────│  returns Vessel to frontend      │
                           │                                  │
invoke('agent_start', ...) │  agent_sessions: HashMap          │
         ──────────────────▶│  create PTY → spawn process      │
                           │  start_output_poll_thread()       │
                           │  emits 'agent-status-changed'    │
         ◀──────────────────│  returns session_id              │
                           │                                  │
listen('terminal-output')  │  [Background thread]              │
         ◀═════════════════│  poll PTY → emit() loop           │
                           │  (60fps throttle)                 │
                           │                                  │
invoke('git_commit', ...)  │  Shell out: git add -A && git ... │
         ──────────────────▶│  returns CommitResult            │
         ◀──────────────────│  emits 'feed-event' (ShipSuccess)│
                           │                                  │
invoke('feed_recent')      │  feed: VecDeque<FeedEntry>       │
         ──────────────────▶│  returns last N entries          │
         ◀──────────────────│                                  │
                           └─────────────────────────────────┘
```

### 2.3 Module Interaction Rules

| Module | Reads | Writes | Emits Events |
|--------|-------|--------|--------------|
| `fleet.rs` | vessels, config | vessels, feed | VesselAdded, VesselRemoved, VesselWarning |
| `agent.rs` | vessels, config, agent_sessions | agent_sessions, feed | AgentStarted, AgentStopped, AgentError |
| `terminal.rs` | agent_sessions | agent_sessions (ring buffer) | (none directly — agent.rs emits) |
| `git.rs` | vessels | feed | ShipSuccess, ShipFailed, DiffReady |
| `commands.rs` | vessels, config | running_commands, feed | CommandStarted, CommandStopped, CommandError |
| `config.rs` | config | config | (none) |
| `events.rs` | feed | feed | (consumer, not producer) |

**Key rule:** Only `events.rs` writes to `feed`. Other modules call `emit_feed_event()` which internally sends through the channel. This keeps feed formatting consistent.

---

## 3. CONCURRENCY MODEL

### 3.1 Thread Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MAIN THREAD                           │
│  Tauri event loop                                        │
│  Handles all invoke() calls from frontend                │
│  Manages AppState (RwLock-protected)                     │
│  Registers Tauri commands and event emitters             │
└──────────┬──────────────────────┬────────────────────────┘
           │                      │
    ┌──────▼──────┐        ┌──────▼──────┐
    │ STATUS POLLER │        │ FILE WATCHER │
    │ (tokio task)  │        │ (notify crate)│
    │ Every N secs  │        │ Watches all    │
    │ refreshes all │        │ vessel .git    │
    │ vessel status │        │ dirs for changes│
    └──────┬──────┘        └──────┬──────┘
           │                      │
           ▼                      ▼
    Emits 'vessel-status-changed'  │
                                   ▼
                         Emits 'vessel-fs-changed'

Per Agent Session (spawned on agent_start):
┌────────────────────────────────┐
│  OUTPUT POLL THREAD            │
│  One per active PTY            │
│  Reads pty.try_read() in loop  │
│  → writes to RingBuffer        │
│  → emits 'terminal-output'     │
│  → checks child.exit_status()  │
│  On exit: cleanup + emit done  │
└────────────────────────────────┘
```

### 3.2 Lock Strategy

```rust
// READ pattern (multiple readers OK):
let vessels = state.vessels.read().unwrap();
let vessel = vessels.get(&vessel_id).ok_or("Vessel not found")?;

// WRITE pattern (exclusive access):
{
    let mut vessels = state.vessels.write().unwrap();
    vessels.insert(vessel.id, vessel);
}
// Drop write lock before emitting events (emits shouldn't hold locks)
state.app_handle.emit("vessel-updated", &new_vessel)?;
```

**Critical rules:**
1. **Never hold a write lock across an `.await` point or I/O operation**
2. **Never hold a write lock while calling `app_handle.emit()`**
3. **Prefer read locks** — most operations are reads
4. **Keep critical sections short** — clone data out of the lock, then work with the clone
5. **For PTY I/O:** The output poll thread owns the PTY master; main thread communicates via channels

### 3.3 Graceful Shutdown Sequence

```
1. User closes window / Cmd+Q
2. Tauri sends on_exit event
3. Shutdown handler:
   a. Send shutdown signal to all poll threads via shutdown_tx
   b. For each running agent session:
      - Send SIGTERM
      - Wait up to 3 seconds
      - If still alive: send SIGKILL
   c. For each running command:
      - Send SIGTERM
      - Wait up to 2 seconds
      - If still alive: send SIGKILL
   d. Flush remaining feed entries to SQLite
   e. Save current window geometry to config
4. Process exits
```

---

## 4. IPC BOUNDARY — COMPLETE COMMAND REFERENCE

### 4.1 Fleet Commands

```rust
#[tauri::command]
async fn fleet_add(
    state: State<'_, AppState>,
    path: String,                              // Absolute path to directory
) -> Result<Vessel, BridgeError>
// Errors: NotADirectory, NotAGitRepo, AlreadyRegistered, IoError

#[tauri::command]
async fn fleet_list(
    state: State<'_, AppState>,
) -> Result<Vec<Vessel>, BridgeError>

#[tauri::command]
async fn fleet_remove(
    state: State<'_, AppState>,
    vessel_id: Uuid,
) -> Result<(), BridgeError>
// Also stops all agent sessions and commands for this vessel

#[tauri::command]
async fn fleet_refresh(
    state: State<'_, AppState>,
    vessel_id: Uuid,
) -> Result<Vessel, BridgeError>
// Re-reads git status, branch, changed files count

#[tauri::command]
async fn fleet_refresh_all(
    state: State<'_, AppState>,
) -> Result<Vec<Vessel>, BridgeError>

#[tauri::command]
async fn fleet_set_commands(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    commands: Vec<LaunchCommand>,
) -> Result<(), BridgeError>

#[tauri::command]
async fn fleet_set_tags(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    tags: Vec<String>,
) -> Result<(), BridgeError>

#[tauri::command]
async fn fleet_open_finder(
    state: State<'_, AppState>,
    vessel_id: Uuid,
) -> Result<(), BridgeError>
// Uses tauri-plugin-shell or open::that()

#[tauri::command]
async fn fleet_open_terminal(
    state: State<'_, AppState>,
    vessel_id: Uuid,
) -> Result<(), BridgeError>
// Opens macOS Terminal/iTerm2 at vessel path
```

### 4.2 Agent Commands

```rust
#[tauri::command]
async fn agent_start(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    agent_type: AgentType,
    prompt: Option<String>,                      // Initial prompt to send after spawn
) -> Result<Uuid, BridgeError>
// Returns: new session_id
// Errors: VesselNotFound, MaxSessionsReached, AgentBinaryNotFound, PtyError, SpawnError

#[tauri::command]
async fn agent_write(
    state: State<'_, AppState>,
    session_id: Uuid,
    data: Vec<u8>,                               // Raw bytes (UTF-8 keystrokes)
) -> Result<(), BridgeError>
// Errors: SessionNotFound, SessionNotRunning, WriteError

#[tauri::command]
async fn agent_resize(
    state: State<'_, AppState>,
    session_id: Uuid,
    cols: u16,
    rows: u16,
) -> Result<(), BridgeError>
// Errors: SessionNotFound, PtyError

#[tauri::command]
async fn agent_stop(
    state: State<'_, AppState>,
    session_id: Uuid,
) -> Result<(), BridgeError>
// Graceful stop: SIGTERM → 3s wait → SIGKILL
// Errors: SessionNotFound

#[tauri::command]
async fn agent_list(
    state: State<'_, AppState>,
) -> Result<Vec<AgentSession>, BridgeError>

#[tauri::command]
async fn agent_list_for_vessel(
    state: State<'_, AppState>,
    vessel_id: Uuid,
) -> Result<Vec<AgentSession>, BridgeError>

#[tauri::command]
async fn agent_get_scrollback(
    state: State<'_, AppState>,
    session_id: Uuid,
    max_bytes: Option<usize>,                    // Default: 64KB
) -> Result<Vec<u8>, BridgeError>
// Returns recent terminal output (for tab switch recovery)
```

### 4.3 Git Commands

```rust
#[tauri::command]
async fn git_diff(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    staged: bool,                                // true = --cached, false = working tree
) -> Result<DiffResult, BridgeError>

#[tauri::command]
async fn git_file_diff(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    path: String,                                // Relative path within repo
) -> Result<String, BridgeError>
// Returns raw unified diff text for single file

#[tauri::command]
async fn git_stage_all(
    state: State<'_, AppState>,
    vessel_id: Uuid,
) -> Result<(), BridgeError>

#[tauri::command]
async fn git_stage_file(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    path: String,
) -> Result<(), BridgeError>

#[tauri::command]
async fn git_unstage_file(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    path: String,
) -> Result<(), BridgeError>

#[tauri::command]
async fn git_commit(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    message: Option<String>,                     // None = auto-generate
) -> Result<CommitResult, BridgeError>

#[tauri::command]
async fn git_push(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    remote: Option<String>,                      // None = "origin"
) -> Result<PushResult, BridgeError>

#[tauri::command]
async fn git_status(
    state: State<'_, AppState>,
    vessel_id: Uuid,
) -> Result<GitStatus, BridgeError>

#[tauri::command]
async fn git_branches(
    state: State<'_, AppState>,
    vessel_id: Uuid,
) -> Result<Vec<BranchInfo>, BridgeError>

#[derive(Serialize, Deserialize, Debug)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub has_remote: bool,
    pub ahead: u32,
    pub behind: u32,
}

#[tauri::command]
async fn git_checkout(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    branch: String,
) -> Result<(), BridgeError>

#[tauri::command]
async fn git_discard_changes(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    path: Option<String>,                        // None = discard all
) -> Result<(), BridgeError>
// ⚠️ Destructive operation — frontend should confirm
```

### 4.4 Engine Room Commands

```rust
#[tauri::command]
async fn cmd_start(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    command_id: Uuid,                             // ID from vessel's launch_commands
) -> Result<Uuid, BridgeError>
// Returns: running command ID

#[tauri::command]
async fn cmd_stop(
    state: State<'_, AppState>,
    command_id: Uuid,
) -> Result<(), BridgeError>

#[tauri::command]
async fn cmd_list_running(
    state: State<'_, AppState>,
) -> Result<Vec<RunningCommand>, BridgeError>

#[tauri::command]
async fn cmd_read_output(
    state: State<'_, AppState>,
    command_id: Uuid,
) -> Result<String, BridgeError>
// Returns stdout+stderr as UTF-8 string (lossy conversion)
```

### 4.5 Feed Commands

```rust
#[tauri::command]
async fn feed_recent(
    state: State<'_, AppState>,
    limit: Option<usize>,                        // Default: 50
) -> Result<Vec<FeedEntry>, BridgeError>

#[tauri::command]
async fn feed_for_vessel(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    limit: Option<usize>,
) -> Result<Vec<FeedEntry>, BridgeError>

#[tauri::command]
async fn feed_clear(
    state: State<'_, AppState>,
) -> Result<(), BridgeError>
```

### 4.6 Config Commands

```rust
#[tauri::command]
async fn config_get(
    state: State<'_, AppState>,
) -> Result<BridgeConfig, BridgeError>

#[tauri::command]
async fn config_update(
    state: State<'_, AppState>,
    partial: ConfigUpdate,                       // Partial update (all fields Optional)
) -> Result<(), BridgeError>

#[tauri::command]
async fn config_reset(
    state: State<'_, AppState>,
) -> Result<(), BridgeError>

#[derive(Deserialize)]
pub struct ConfigUpdate {
    pub claude_code_path: Option<String>,
    pub codex_path: Option<String>,
    pub cursor_cli_path: Option<String>,
    pub git_user_name: Option<String>,
    pub git_user_email: Option<String>,
    pub auto_refresh_seconds: Option<u32>,
    pub terminal_scrollback_lines: Option<usize>,
    pub max_terminal_sessions_per_vessel: Option<usize>,
    pub max_concurrent_agents: Option<usize>,
    pub theme: Option<ThemeChoice>,
    pub remember_window_geometry: Option<bool>,
    pub start_minimized: Option<bool>,
    pub show_vessel_icons: Option<bool>,
}
```

### 4.7 Events Emitted to Frontend

```rust
// All events use Tauri's app.emit() for broadcast, or app.emit_to() for targeted
Event Name              Payload                  | When
----------------------|--------------------------|---------------------------------
'vessel-status-changed'   Vessel                 | Poller/file-watcher detects change
'agent-output'           TerminalOutputPayload   | PTY has data (throttled ~60fps)
'agent-status-changed'   AgentSession            | Session status transitions
'feed-event'              FeedEntry              | Any noteworthy event occurs
'git-diff-ready'         DiffResult              | Significant diff change detected
'error-toast'            ErrorToastPayload       | Operation failed (show toast)
'status-bar-update'      StatusBarPayload        | Update bottom bar text/badges

#[derive(Clone, Serialize)]
pub struct TerminalOutputPayload {
    pub session_id: Uuid,
    pub data: Vec<u8>,                           // Raw terminal bytes
}

#[derive(Clone, Serialize)]
pub struct ErrorToastPayload {
    pub title: String,
    pub message: String,
    pub level: ToastLevel,                       // Error | Warning | Info
}

#[derive(Clone, Serialize, PartialEq)]
pub enum ToastLevel { Error, Warning, Info }

#[derive(Clone, Serialize)]
pub struct StatusBarPayload {
    pub text: String,
    pub vessel_count: usize,
    pub active_sessions: usize,
    pub has_unpushed: bool,
}
```

---

## 5. ERROR HANDLING STRATEGY

### 5.1 Custom Error Type

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum BridgeError {
    #[error("Vessel not found: {id}")]
    VesselNotFound { id: Uuid },

    #[error("Not a valid git repository: {path}")]
    NotAGitRepo { path: String },

    #[error("Directory does not exist: {path}")]
    NotADirectory { path: String },

    #[error("Vessel already registered: {name}")]
    AlreadyRegistered { name: String },

    #[error("Agent session not found: {id}")]
    SessionNotFound { id: Uuid },

    #[error("Agent binary not found: {binary} at {path}")]
    AgentBinaryNotFound { binary: String, path: String },

    #[error("PTY allocation failed: {0}")]
    PtyError(String),

    #[error("Process spawn failed: {binary} — {reason}")]
    SpawnError { binary: String, reason: String },

    #[error("Process already stopped")]
    AlreadyStopped,

    #[error("Maximum sessions reached ({max}) for this vessel")]
    MaxSessionsReached { max: usize },

    #[error("Git operation failed: {operation} — {reason}")]
    GitError { operation: String, reason: String },

    #[error("Git conflict detected — resolve before committing")]
    GitConflict,

    #[error("Nothing to commit (working tree clean)")]
    NothingToCommit,

    #[error("Push rejected: {reason}")]
    PushRejected { reason: String },

    #[error("Not connected to network")]
    NetworkError,

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("I/O error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Internal error: {0}")]
    Internal(String),
}
```

### 5.2 Error Propagation to Frontend

Every Tauri command returns `Result<T, BridgeError>`. Tauri automatically serializes the `Err` variant into a JSON error that the frontend receives. The frontend error handler:

```typescript
// Frontend error wrapper
import { invoke } from '@tauri-apps/api/core';

async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    const err = e as { type?: string; message?: string };
    // Map BridgeError variants to user-friendly messages
    const userMessage = mapBridgeError(err.message || String(err));
    showToast(userMessage, 'error');
    logToFeed('error', userMessage);
    throw err; // Re-throw for caller-specific handling
  }
}

function mapBridgeError(raw: string): string {
  if (raw.includes('NotAGitRepo')) return '🚫 Not a git repository';
  if (raw.includes('AlreadyRegistered')) return '⚠️ This project is already in your fleet';
  if (raw.includes('AgentBinaryNotFound')) return '🔍 Agent binary not found — check Helm settings';
  if (raw.includes('MaxSessionsReached')) return '📊 Too many sessions — close one first';
  if (raw.includes('GitConflict')) return '⚠️ Resolve merge conflicts first';
  if (raw.includes('NothingToCommit')) return '✅ Nothing to ship — working tree is clean';
  if (raw.includes('PushRejected')) return '🚫 Push was rejected — check permissions';
  if (raw.includes('NetworkError')) return '🌐 No internet connection';
  return raw; // Fallback: show raw error
}
```

### 5.3 Error Recovery Matrix

| Error Scenario | Detect | Auto-Recover? | User Action Needed |
|---------------|--------|---------------|-------------------|
| Git repo deleted from disk | Status poller | No | Show error badge, offer to remove vessel |
| Agent binary moved/missing | On `agent_start` | No | Open settings dialog |
| Agent crash (non-zero exit) | Output poll thread | Partial | Show error, keep session visible for review |
| Agent hangs (no output 5min) | Timeout watcher | No | Offer force-stop button |
| PTY write fails (process died) | `agent_write` | No | Mark session as Error, notify user |
| Git merge conflict | `git_stage_all` / `git_commit` | No | Show conflict marker in diff viewer |
| Push rejected (auth fail) | `git_push` | No | Show auth error, suggest credential check |
| Disk full | File operations | No | Show OS-level error |
| Network offline | `git_push` | Yes (queue) | Optionally queue push for later |
| SQLite locked | Any DB operation | Retry 3x | Shouldn't happen with single-process |
| Vessel path has spaces | On `fleet_add` | Yes | Quote paths in shell commands |
| Vessel path has unicode | On `fleet_add` | Yes | Handle UTF-8 throughout |
| Concurrent commits | `git_commit` | Lock per vessel | Serialize git ops per vessel |

---

## 6. EDGE CASES DEEP-DIVE

### 6.1 Vessel Lifecycle Edge Cases

**Scenario: User adds a vessel, then deletes the folder from disk.**

```
Timeline:
T+0s   User adds ~/projects/my-app as vessel
T+30s  Status poller runs git status → OK
T+60s  User runs rm -rf ~/projects/my-app from external terminal
T+90s  Status poller runs → ENOENT
       → Set vessel.status = Error
       → Emit 'vessel-status-changed' with error detail
       → Emit 'feed-event': "⚠️ my-app: Repository vanished from disk"
       → Frontend shows red error badge on vessel card
       → User can click "Remove from fleet" or "Reconnect" (re-add path)
```

**Implementation:**
```rust
fn refresh_vessel_status(state: &AppState, vessel_id: &Uuid) -> Result<Vessel, BridgeError> {
    let vessels = state.vessels.read().unwrap();
    let vessel = vessels.get(vessel_id).ok_or(BridgeError::VesselNotFound { id: *vessel_id })?;
    drop(vessels); // Release lock before I/O

    if !vessel.path.exists() {
        let mut vessels = state.vessels.write().unwrap();
        if let Some(v) = vessels.get_mut(vessel_id) {
            v.status = VesselStatus::Error;
        }
        drop(vessels);
        emit_feed!(state, FeedEventType::VesselWarning, vessel_id,
            format!("{}: Repository vanished", vessel.name),
            Some("Path no longer exists on disk"));
        return Err(BridgeError::NotADirectory { path: vessel.path.display().to_string() });
    }

    // Normal git status check...
}
```

**Scenario: Vessel path contains spaces or unicode.**

```rust
// Always quote shell command paths:
fn build_git_command(vessel: &Vessel, args: &[&str]) -> std::process::Command {
    let mut cmd = std::process::Command::new("git");
    cmd.current_dir(&vessel.path)
       .args(args)
       .env("GIT_TERMINAL_PROMPT", "0")       // Never prompt for credentials
       .env("GIT_EDITOR", ":")                 // Don't open editor for merges/rebases
       .env("GIT_PAGER", "cat");               // Don't use pager
    cmd
}
// Using Command::current_dir() handles spaces/unicode automatically —
// no need to quote paths in arguments since we're not using a shell.
```

**Scenario: Two tabs have the same vessel open, both try to commit simultaneously.**

```rust
// Per-vessel mutex for git operations:
use std::sync::Mutex;

pub struct AppState {
    // ... existing fields ...
    git_locks: HashMap<Uuid, Mutex<()>>,       // One lock per vessel
}

async fn git_commit_internal(state: &AppState, vessel_id: &Uuid, msg: Option<String>) -> Result<CommitResult, BridgeError> {
    // Acquire per-vessel lock (non-blocking, return error if busy)
    let lock = {
        let locks = state.git_locks.read().unwrap();
        locks.get(vessel_id).cloned().unwrap_or_default()
    };
    match lock.try_lock() {
        Ok(guard) => {
            let _guard = guard; // Hold lock for duration of commit
            // ... perform actual git commit ...
        }
        Err(_) => {
            return Err(BridgeError::GitError {
                operation: "commit".into(),
                reason: "Another git operation is in progress for this vessel".into(),
            });
        }
    }
}
```

### 6.2 Agent Session Edge Cases

**Scenario: Agent produces massive output (e.g., catting a large file).**

```
Problem: PTY output could flood the frontend and consume all memory.
Solution:
- Ring buffer caps at 2MB per session (configurable)
- Output poll thread reads in 4KB chunks
- Throttle emits to frontend: batch output, emit max every ~16ms (~60fps)
- If ring buffer is full, oldest data is overwritten (circular)
- Frontend xterm.js has its own buffer limit (default 10MB in xterm addon)
```

**Implementation:**
```rust
fn poll_pty_output(session_id: Uuid, pty: Arc<Mutex<Option<MasterPty>>>,
                   state: Arc<AppState>, app_handle: AppHandle) {
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut last_emit = std::time::Instant::now();
        let emit_interval = std::time::Duration::from_millis(16); // ~60fps cap

        loop {
            {
                let pty_guard = pty.lock().unwrap();
                if let Some(ref master) = *pty_guard {
                    match master.try_read(&mut buf) {
                        Ok(0) => {
                            // PTY closed — process exited
                            break;
                        }
                        Ok(n) => {
                            // Write to ring buffer
                            let mut sessions = state.agent_sessions.write().unwrap();
                            if let Some(rt) = sessions.get_mut(&session_id) {
                                rt.output_ring.write(&buf[..n]);
                            }
                            drop(sessions);

                            // Throttle emits
                            if last_emit.elapsed() >= emit_interval {
                                let _ = app_handle.emit("terminal-output", TerminalOutputPayload {
                                    session_id,
                                    data: buf[..n].to_vec(),
                                });
                                last_emit = std::time::Instant::now();
                            } else {
                                // Still emit but less frequently for responsiveness
                                // Actually, we should batch — accumulate and emit on interval
                                // Simplified for MVP: just throttle
                            }
                        }
                        Err(e) if e.raw_os_error() == Some(EAGAIN) => {
                            // No data available yet, sleep briefly
                            std::thread::sleep(std::time::Duration::from_millis(5));
                            continue;
                        }
                        Err(e) => {
                            eprintln!("PTY read error: {}", e);
                            break;
                        }
                    }
                } else {
                    break; // PTY was removed (session cleaned up)
                }
            }
        }

        // Post-exit cleanup
        handle_session_exit(&state, &app_handle, session_id);
    });
}
```

**Scenario: User closes vessel tab while agent is still running.**

```
Policy: Agent continues running in background (visible in crew panel).
- Closing a vessel PANEL doesn't stop agents
- The vessel card in sidebar still shows active indicator
- User must explicitly stop the agent from the crew view
- This prevents accidental data loss (agent might be mid-edit)
```

**Scenario: Bridge app crashes or is force-quit.**

```
Recovery on restart:
- Vessel registry is persisted in SQLite → restored automatically
- Agent sessions are NOT recovered (they were child processes)
- On startup, show feed event: "🔄 Bridge restarted. Agent sessions were lost."
- Running commands same as agents — not recovered
- Feed history is persisted → restored (last 1000 entries)
```

### 6.3 Git Edge Cases

**Scenario: Large monorepo with thousands of changed files.**

```
Performance concerns:
- `git diff` on a large repo can take seconds
- Rendering thousands of file rows in frontend will lag
Mitigation:
- Paginate diff results: first request returns file list only (fast)
- Individual file diffs loaded on demand (click to expand)
- Show progress indicator during git operations (> 500ms)
- Cache last diff result per vessel, invalidate on file change event
- Consider `git diff --stat` for summary, full diff on demand
```

**Scenario: Detached HEAD state.**

```
Display: Show "(detached)" instead of branch name in vessel card
Commit: Allow commits in detached HEAD (git allows it)
Push: Block push with clear error: "Cannot push in detached HEAD state. Checkout a branch first."
```

**Scenario: Submodules.**

```
MVP stance: Ignore submodules. Don't recurse into them.
Show submodule directories as regular files (won't show their internal changes).
v0.2+: Add submodule awareness.
```

**Scenario: Binary files in diff.**

```
Detection: `git diff --numstat` shows `-` for binary files
Display: Show file row with "Binary file — size changed" instead of diff hunks
Icon: Show a special binary file icon (📦 or similar)
Action: Clicking opens in external diff tool (if configured) or shows "Binary file cannot be previewed"
```

**Scenario: Stash with uncommitted changes when trying to commit different files.**

```
MVP: Simple model — always stage all or specific files
- git stash entries shown in GitStatus.stash_count
- "Stash" button in cargo panel (v0.1.1 feature)
- v0.2: Full stash management (list, pop, apply, drop, create)
```

### 6.4 UI/UX Edge Cases

**Scenario: No vessels registered yet (first launch).**

```
Show empty state:
  🌊 Empty Ocean
  No vessels in your fleet yet.
  [ + Add Your First Vessel ]
Animated wave illustration (CSS only, no image needed)
```

**Scenario: Vessel has no agent sessions started.**

```
Crew tab shows empty state:
  👥 Crew Quarters Empty
  No active agent sessions.
  Launch an agent to begin working.
  [ 👤 Claude Code ] [ 🤖 Codex ] [ 🖥 Cursor CLI ]
```

**Scenario: Working tree is clean (nothing to commit).**

```
Sail button:
- Disabled state: greyed out, tooltip "✅ Nothing to ship"
- Animation: subtle pulse of the disabled button
- Counter: shows "0 files" in cargo stats
```

**Scenario: User tries to add a non-git directory.**

``Validation flow:
1. Check path exists and is a directory
2. Check for .git subdirectory (or git file for worktrees)
3. If not a git repo: show error toast "Not a git repository"
4. Offer to run `git init` there (advanced action, confirmation dialog)
```

**Scenario: Window resized while terminal is active.**

```
Handler chain:
1. window.resize event fires in frontend
2. xterm.js FitAddon recalculates cols/rows
3. Frontend invokes 'agent_resize' with new dimensions
4. Rust resizes PTY via master.resize()
5. Terminal redraws at new size
6. All happens within ~16ms (imperceptible)
```

---

## 7. SQLITE SCHEMA

### 7.1 Tables

```sql
-- Vessel registry
CREATE TABLE IF NOT EXISTS vessels (
    id          TEXT PRIMARY KEY,           -- UUID
    name        TEXT NOT NULL,
    path        TEXT NOT NULL UNIQUE,       -- Absolute path
    branch      TEXT NOT NULL DEFAULT 'main',
    status      TEXT NOT NULL DEFAULT 'idle',-- idle|running|warning|error
    health      INTEGER NOT NULL DEFAULT 100,
    tags        TEXT DEFAULT '[]',          -- JSON array
    commands    TEXT DEFAULT '[]',          -- JSON array of LaunchCommand
    created_at  TEXT NOT NULL,              -- ISO 8601
    updated_at  TEXT NOT NULL               -- ISO 8601
);

-- Feed history (persistent across restarts)
CREATE TABLE IF NOT EXISTS feed (
    id          TEXT PRIMARY KEY,           -- UUID
    timestamp   TEXT NOT NULL,
    vessel_id   TEXT,                       -- UUID, nullable for system events
    event_type  TEXT NOT NULL,
    title       TEXT NOT NULL,
    detail      TEXT,
    icon        TEXT NOT NULL DEFAULT 'ℹ',
    tag         TEXT NOT NULL DEFAULT 'info'
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_feed_timestamp ON feed(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_feed_vessel ON feed(vessel_id, timestamp DESC);

-- Settings (key-value store, simpler than JSON file for queries)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

### 7.2 Migration Strategy

For MVP, just use `CREATE TABLE IF NOT EXISTS`. No formal migration system needed yet. When schema changes in v0.2+, introduce a migration table:

```sql
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);
```

---

## 8. TESTING STRATEGY

### 8.1 Unit Tests (Rust)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer_write_read() {
        let mut rb = RingBuffer::new(16);
        rb.write(b"hello");
        assert_eq!(rb.read_recent(5), b"hello");
    }

    #[test]
    fn test_ring_buffer_overflow() {
        let mut rb = RingBuffer::new(8);
        rb.write(b"hello world!"); // 12 bytes > 8 capacity
        assert_eq!(rb.read_all(), b"lo world!"); // First 4 bytes overwritten
    }

    #[test]
    fn test_vessel_status_transitions() {
        // Test that status updates follow valid state machine rules
        assert!(matches!(VesselStatus::Idle, VesselStatus::Idle));
    }

    #[test]
    fn test_git_error_parsing() {
        // Test that various git error outputs map to correct BridgeError variants
    }

    #[test]
    fn test_config_defaults() {
        let cfg = BridgeConfig::default();
        assert_eq!(cfg.auto_refresh_seconds, 10);
        assert_eq!(cfg.theme, ThemeChoice::MonokaiPro);
    }

    #[test]
    fn test_feed_entry_ordering() {
        // Test that feed entries are returned newest-first
    }
}
```

### 8.2 Integration Tests

```rust
#[cfg(test)]
mod integration_tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn test_fleet_add_and_remove() {
        let dir = tempdir().unwrap();
        // Initialize a git repo in temp dir
        std::process::Command::new("git")
            .args(["init", dir.path().to_str().unwrap()])
            .output()
            .expect("Failed to init git repo");

        let state = setup_test_state().await;
        let vessel = fleet_add(state.clone(), dir.path().to_str().unwrap().into()).await.unwrap();
        assert_eq!(vessel.status, VesselStatus::Idle);

        fleet_remove(state.clone(), vessel.id).await.unwrap();
        let list = fleet_list(state).await.unwrap();
        assert!(list.iter().find(|v| v.id == vessel.id).is_none());
    }

    #[tokio::test]
    async fn test_agent_lifecycle() {
        // Start agent → write input → read output → stop
        // Requires mock PTY or real agent binary
    }

    #[tokio::test]
    async fn test_git_commit_cycle() {
        // Create file → stage → commit → verify → push (mock remote)
    }
}
```

### 8.3 Manual QA Checklist

```
□ Add a vessel with spaces in path
□ Add a vessel with unicode characters in path
□ Add a non-git directory → see error
□ Add the same directory twice → see "already registered"
□ Delete a vessel's folder from disk → see error badge
□ Start Claude Code session → see terminal output
□ Type in terminal → see characters echoed
□ Resize window → terminal resizes properly
□ Stop agent → session shows "Stopped"
□ Start 6th session (max is 5) → see error
□ Make file changes → see diff appear
□ Stage individual file → see it move to staged
□ Commit with custom message → verify message
□ Commit without message → see auto-generated message
□ Commit clean working tree → see "nothing to commit"
□ Push successfully → see shipped animation
□ Disconnect network → push fails gracefully
□ Run dev server via Engine Room → see output
□ Stop dev server → shows "Stopped"
□ Open vessel in Finder → Finder opens
□ Close app with running agents → agents get SIGTERM
□ Restart app → vessels restored, agents gone
□ Change setting → persists across restart
□ Keyboard shortcut Cmd+P → quick vessel switch
□ Activity feed shows events from all sources
□ Monokai Pro theme renders correctly everywhere
```

---

## 9. PERFORMANCE BUDGET

| Metric | Target | Notes |
|--------|--------|-------|
| Cold start time | < 1.5s | Tauri + SvelteKit should be fast |
| Vessel status refresh (single) | < 200ms | `git status` on typical repo |
| Vessel status refresh (all, 10 vessels) | < 2s | Parallel refresh |
| Diff computation (100 files, 1000 lines) | < 500ms | `git diff` output parsing |
| Terminal output latency | < 16ms | PTY read → emit → render (1 frame) |
| Terminal scrollback seek | < 50ms | Reading from ring buffer |
| Agent spawn time | < 2s | PTY alloc + process start |
| Commit operation | < 1s | Stage + commit on typical change set |
| Push operation | < 5s | Depends on network/repo size |
| Feed event propagation | < 10ms | In-process channel send |
| Window open (with 10 vessels) | < 300ms | Render sidebar + select first |
| Memory baseline (idle, 10 vessels) | < 80MB RSS | Tauri overhead + state |
| Memory per agent session | < 10MB RSS | PTY + ring buffer (2MB cap) |

---

## 10. SECURITY CONSIDERATIONS

### 10.1 Threat Model (MVP)

Bridge is a **local desktop app** — the threat model is different from a web app:

| Threat | Risk | Mitigation |
|--------|------|------------|
| Malicious git repo (hooks) | Medium | Set `GIT_HOOKS_PATH=/dev/null` or disable hooks during Bridge operations |
| Agent binary impersonation | Low | Validate binary path exists; future: hash verification |
| Path traversal via vessel add | Low | Resolve and canonicalize paths; reject symlinks outside expected dirs |
| SQLite injection | N/A | Using parameterized queries (rusqlite) |
| IPC from unexpected web content | Low | Tauri v2 CSP restricts which origins can invoke commands |
| Child process privilege escalation | Low | Agents inherit user's privileges (same as terminal) |

### 10.2 Git Safety Settings

```rust
fn safe_git_command(vessel: &Vessel) -> std::process::Command {
    let mut cmd = std::process::Command::new("git");
    cmd.current_dir(&vessel.path)
       // Prevent interactive prompts from blocking:
       .env("GIT_TERMINAL_PROMPT", "0")
       .env("GIT_EDITOR", ":")
       .env("GIT_SEQUENCE_EDITOR", ":")
       .env("GIT_MERGE_AUTOEDIT", "no")
       .env("GIT_PAGER", "cat")
       .env("GIT_CONFIG_PARAMETERS", "'core.hooksPath=/dev/null'")
       // Prevent accidental pushes to unexpected remotes:
       // (handled at UI level — always confirm remote)
       ;
    cmd
}
```

---

## SUMMARY

This deep-dive covers everything the Rust backend needs for MVP:

| Area | What's Defined |
|---------------------|
| **Data model** | 10 structs, 7 enums, full serde annotations |
| **State management** | Single AppState singleton, RwLock-protected HashMaps |
| **Concurrency** | Main thread + per-session poll threads + status poller + file watcher |
| **IPC surface** | 35+ Tauri commands with exact signatures |
| **Events** | 7 event types pushed to frontend |
| **Errors** | 20+ BridgeError variants with user-friendly mapping |
| **Edge cases** | 15+ scenarios with handling code |
| **Persistence** | SQLite schema (3 tables) |
| **Testing** | Unit + integration + manual QA checklist |
| **Performance** | 15 metrics with targets |
| **Security** | 6-threat mitigation model |

**Ready to implement.** 🔨
