# Bridge × Pi Deep Integration Spec

> **Part of:** Bridge MVP v0.1 "Sea Trials"
> **Focus:** Pi Coding Agent as the sole first-class agent — full CLI surface integration
> **Date:** 2026-05-21

---

## 1. WHY PI-FIRST CHANGES EVERYTHING

The original spec assumed generic "agent types" (Claude Code, Codex, Cursor CLI) launched via PTY with raw terminal I/O. Pi is different — it has:

1. **A structured streaming JSON protocol** (`--mode json`) — no need to parse terminal screen scraping
2. **Rich session persistence** (JSONL files) — history, replay, inspection built in
3. **Detailed event types** — thinking deltas, tool call start/delta/end, text streaming, token usage
4. **Session lifecycle operations** — resume, fork, continue, export
5. **Per-invocation configuration** — model, provider, thinking level, tools, skills, extensions

This means Bridge can be **much smarter** than a generic terminal multiplexer. It can:
- Show **what Pi is doing** in real-time (not just raw terminal output)
- **Visualize the execution graph** (tool calls → results → next actions)
- **Track costs** precisely per session/vessel/day
- **Browse session history** like an email client
- **Fork past sessions** to retry with different parameters
- **Control Pi's capabilities** per vessel (tools, skills, model)

---

## 2. PI PROTOCOL REFERENCE

### 2.1 JSON Mode Event Stream (`--mode json -p "prompt"`)

Pi outputs one JSON object per line (JSONL) to stdout. These are the event types:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PI JSON MODE EVENT STREAM                        │
│                                                                     │
│  {"type":"session", "id":"uuid", "cwd":"/path", ...}               │ ← Session metadata
│  {"type":"agent_start"}                                             │ ← Pi started processing
│  {"type":"turn_start"}                                              │ ← New conversation turn
│                                                                     │
│  {"type":"message_start", "message":{"role":"user",...}}            │ ← User message begins
│  {"type":"message_end",   "message":{"role":"user",...}}            │ ← User message complete
│                                                                     │
│  {"type":"message_start", "message":{"role":"assistant",...}}       │ ← Assistant response begins
│   ┌─ {"type":"message_update", "assistantMessageEvent":{             │
│   │     "type":"thinking_start", ...}}                              │ ← Pi started thinking
│   │ {"type":"message_update", "assistantMessageEvent":{             │
│   │     "type":"thinking_delta", "delta":"The user..."}}           │ ← Thinking text chunk
│   │ ...more thinking_delta...                                       │
│   │ {"type":"message_update", "assistantMessageEvent":{             │
│   │     "type":"thinking_end", ...}}                                │ ← Thinking complete
│   │                                                                 │
│   │ {"type":"message_update", "assistantMessageEvent":{             │
│   │     "type":"text_start", ...}}                                  │ ← Text response began
│   │ {"type":"message_update", "assistantMessageEvent":{             │
│   │     "type":"text_delta", "delta":"Hello!"}}                    │ ← Text chunk
│   │ ...more text_delta...                                           │
│   │ {"type":"message_update", "assistantMessageEvent":{             │
│   │     "type":"text_end", ...}}                                    │ ← Text complete
│   │                                                                 │
│   │ {"type":"message_update", "assistantMessageEvent":{             │
│   │     "type":"toolcall_start",                                    │ ← Tool call began
│   │     "contentIndex":1, "partial":{...}}}                         │    (shows tool name)
│   │ {"type":"message_update", "assistantMessageEvent":{             │
│   │     "type":"toolcall_delta", "delta":"{\"arg\":..."}}          │ ← Tool args streaming
│   │ {"type":"message_update", "assistantMessageEvent":{             │
│   │     "type":"toolcall_end", ...}}                                │ ← Tool call complete
│   │                                                                 │
│   └─ (toolResult messages come as separate message_start/end pairs)  │
│                                                                     │
│  {"type":"message_end",   "message":{                               │
│     "role":"assistant", "usage":{"totalTokens":N, "cost":{...}},    │
│     "stopReason":"stop"}}                                           │ ← Response complete + stats
│                                                                     │
│  {"type":"turn_end"}                                                │ ← Turn complete
│  {"type":"agent_end"}                                               │ ← Pi finished
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Session File Format (JSONL on disk)

**Location pattern:** `~/.pi/agent/sessions/<url-encoded-cwd>/<timestamp>_<uuid>.jsonl`

**Event types in stored sessions:**

| Type | Description | Key Fields |
|------|-------------|------------|
| `session` | Session header | id, version(=3), timestamp, cwd |
| `model_change` | Model switched | id, parentId, provider, modelId |
| `thinking_level_change` | Thinking level changed | id, parentId, thinkingLevel |
| `message` | Complete message (user/assistant/toolResult) | id, parentId, timestamp, message:{role, content[], usage?, stopReason?} |
| `custom` | Extension-specific events | customType, data, id, parentId |

**Content part types within messages:**

| Part Type | Fields | When |
|-----------|--------|------|
| `text` | text: string | Regular text content |
| `thinking` | thinking, thinkingSignature | Reasoning/reasoning_content |
| `toolCall` | id, name, arguments | Pi calling a tool |
| `toolResult` (in toolResult role) | toolCallId, toolName, content[], details, isError | Tool's response |

### 2.3 Full CLI Surface Relevant to Bridge

```
pi [options] [@files...] [messages...]

LAUNCH CONTROL:
  --mode json                          ← Structured output (Bridge's primary mode)
  --mode rpc                           ← RPC mode (future: two-way communication)
  --print, -p                          ← Non-interactive: process and exit
  --no-session                         ← Ephemeral (don't save to disk)
  --session-dir <dir>                  ← Where to store sessions (Bridge controls this)

SESSION LIFECYCLE:
  --continue, -c                       ← Continue most recent session
  --resume, -r                         ← Pick a session to resume (TUI selector)
  --session <path\|id>                 ← Use specific session file or UUID
  --fork <path\|id>                    ← Fork a session into a new one

MODEL & BEHAVIOR:
  --provider <name>                    ← AI provider (google, anthropic, openai, etc.)
  --model <pattern>                    ← Model ID or pattern
  --thinking <level>                   ← off|minimal|low|medium|high|xhigh
  --api-key <key>                      ← API key override
  --system-prompt <text>               ← Override system prompt
  --append-system-prompt <text>        ← Append to system prompt

TOOL/SKILL/EXTENSION CONTROL:
  --tools, -t <list>                   ← Comma-separated tool allowlist
  --no-tools, -nt                      ← Disable all tools
  --no-builtin-tools, -nbt             ← Disable only built-in tools
  --skill <path>                       ← Load skill file(s)
  --no-skills, -ns                     ← Disable skills
  --extension, -e <path>              ← Load extension(s)
  --no-extensions, -ne                 ← Disable extensions
  --prompt-template <path>             ← Load prompt template(s)

CONTEXT:
  @file1 @file2 ...                    ← Include files as context
  --no-context-files, -nc              ← Don't auto-discover AGENTS.md etc.

OUTPUT:
  --export <file>                      ← Export session to HTML
  --verbose                            ← Verbose startup
  --offline                            ← No network startup calls

ENVIRONMENT (relevant):
  PI_CODING_AGENT_SESSION_DIR          ← Override session storage dir
  PI_OFFLINE=1                         ← Offline mode
  ANTHROPIC_API_KEY, OPENAI_API_KEY, etc. ← Provider credentials
```

---

## 3. REVISED ARCHITECTURE — PI-CENTRIC

### 3.1 Two Execution Modes

Bridge supports **two ways** to run Pi, each suited for different use cases:

#### Mode A: Structured JSON Mode (`--mode json`) — **Primary for MVP**

```
┌──────────┐   invoke        ┌─────────────┐   spawn+pipe   ┌──────────┐
│ Frontend  │ ──────────────▶│  pi.rs      │ ─────────────▶│  pi CLI  │
│ (Svelte)  │ ◀──emit(events)│  (Rust)     │ ◀──JSONL stdout│  (--mode  │
│           │                │             │                │   json)  │
└──────────┘                └─────────────┘                └──────────┘
                                   │
                                   ▼ pipe stdin
                              "prompt text\n"
```

**How it works:**
1. Bridge spawns `pi --mode json -p "user prompt"` with CWD set to vessel path
2. Rust reads stdout line-by-line, parsing each JSONL event
3. Events are emitted to frontend via Tauri `emit()` in real-time
4. Frontend renders structured UI (thinking bubbles, tool call cards, text, progress)
5. On `agent_end`, session is complete — summary shown

**Best for:** Non-interactive "fire and forget" tasks, batch processing, background work

**Limitation:** One-shot. Can't send follow-up messages mid-stream.

#### Mode B: Interactive PTY Mode — **For live terminal sessions**

```
┌──────────┐   invoke         ┌─────────────┐   PTY          ┌──────────┐
│ Frontend  │ ───────────────▶│  terminal.rs│ ────────┐      │  pi CLI  │
│ (xterm.js)│ ◀──emit(bytes) │  (Rust)     │ ◀───────┤      │ (interactive)│
│           │ ───invoke(write)│             │ ────────┘      └──────────┘
└──────────┘                  └─────────────┘
```

**How it works:**
1. Same as original agent.rs design — PTY + xterm.js
2. User sees full interactive Pi terminal inside Bridge
3. Can type, interrupt, send multi-turn conversations
4. **Additionally:** Background parser watches the same session JSONL file for structured events

**Best for:** Interactive development, pair-style workflow, debugging

### 3.2 Revised Data Model

```rust
// ═══════════════════════════════════════════
// PI SESSION — replaces generic AgentSession
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiSession {
    pub id: Uuid,                        // Bridge's internal tracking ID
    pub pi_session_id: String,            // Pi's own session UUID
    pub vessel_id: Uuid,
    pub mode: PiMode,                     // Json | PtyInteractive
    pub status: PiStatus,

    // Configuration used for this launch
    pub config: PiLaunchConfig,

    // Timing
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,

    // Accumulated metrics (updated as events arrive)
    pub metrics: SessionMetrics,

    // Path to session file (for reading history)
    pub session_file_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PiMode {
    Json,                                // --mode json -p "prompt"
    PtyInteractive,                      // Interactive PTY (full terminal)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PiStatus {
    Queued,                              // Waiting to start
    Starting,                            // Process spawning
    Idle,                                // Running, waiting for input (PTY mode)
    Thinking,                            // Pi is reasoning (from thinking_start event)
    RunningTool,                         // Pi called a tool (from toolcall_start)
    StreamingText,                       // Pi is producing text (from text_start)
    Done,                                // Exited cleanly (agent_end)
    Error,                               // Crashed / non-zero exit
    Stopped,                             // User cancelled (SIGTERM)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiLaunchConfig {
    // Model selection
    pub provider: Option<String>,         // None = Pi default
    pub model: Option<String>,            // None = Pi default
    pub thinking_level: Option<String>,   // None = Pi default

    // Behavior
    pub system_prompt: Option<String>,
    pub append_system_prompt: Option<String>,

    // Tool/skill control
    pub tools: Option<Vec<String>>,       // None = all; Some([]) = none; Some(vec) = allowlist
    pub no_builtin_tools: bool,
    pub skills: Vec<String>,              // Paths to skill files
    pub extensions: Vec<String>,          // Paths to extension files
    pub no_skills: bool,
    pub no_extensions: bool,

    // Context
    pub context_files: Vec<String>,       // @file paths to include
    pub no_context_files: bool,

    // Session control
    pub session_id: Option<String>,       // Resume/fork specific session
    pub fork_session_id: Option<String>,
    pub no_session: bool,                 // Ephemeral
    pub session_dir: Option<String>,      // Custom session dir

    // Initial prompt (for Json mode)
    pub initial_prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SessionMetrics {
    // Token usage (accumulated across turns)
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_read: u64,
    pub total_cache_write: u64,

    // Cost tracking
    pub total_cost_usd: f64,

    // Turn counting
    pub turn_count: u32,
    pub user_message_count: u32,
    pub assistant_message_count: u32,

    // Tool usage
    pub tool_call_count: u32,
    pub tool_breakdown: HashMap<String, u32>,  // tool_name → count

    // Timing
    pub total_thinking_time_ms: u64,
    pub total_tool_time_ms: u64,
    pub total_time_ms: u64,

    // Files affected (extracted from tool calls)
    pub files_read: HashSet<String>,
    pub files_written: HashSet<String>,
    pub files_edited: HashSet<String>,
    pub bash_commands_run: Vec<BashCommandRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BashCommandRecord {
    pub command: String,
    pub timestamp: DateTime<Utc>,
    pub exit_code: Option<i32>,
}
```

### 3.3 Session History Browser

Pi stores sessions as JSONL files. Bridge reads them directly:

```rust
// ═══════════════════════════════════════════
// SESSION HISTORY — read from Pi's own files
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    pub pi_session_id: String,
    pub vessel_id: Option<Uuid>,          // Matched by cwd
    pub session_file: PathBuf,
    pub created_at: DateTime<Utc>,
    pub cwd: String,

    // Quick stats (computed by scanning the JSONL)
    pub message_count: u32,
    pub turn_count: u32,
    pub has_error: bool,
    pub model_used: Option<String>,
    pub provider_used: Option<String>,

    // Preview (first user message)
    pub preview_text: Option<String>,     // Truncated first user message

    // File size
    pub file_size_bytes: u64,
}

#[tauri::command]
async fn pi_list_sessions(
    state: State<'_, AppState>,
    vessel_id: Option<Uuid>,              // Filter by vessel, or all
    limit: Option<usize>,                 // Default 50
    offset: Option<usize>,
) -> Result<Vec<SessionSummary>, BridgeError>
// Scans ~/.pi/agent/sessions/ directories, parses session headers
// Returns chronological list (newest first)

#[tauri::command]
async fn pi_read_session(
    state: State<'_, AppState>,
    session_file: String,                 // Path to .jsonl file
) -> Result<PiSessionDetail, BridgeError>
// Reads full JSONL, returns reconstructed conversation with all messages/events

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PiSessionDetail {
    pub summary: SessionSummary,
    pub events: Vec<SessionEvent>,        // All parsed events in order
    pub messages: Vec<SessionMessage>,    // Reconstructed conversation
    pub metrics: SessionMetrics,          // Computed metrics
}

#[tauri::command]
async fn pi_fork_session(
    state: State<'_, AppState>,
    session_file: String,
    vessel_id: Uuid,
    prompt_override: Option<String>,      // New initial prompt for forked session
) -> Result<Uuid, BridgeError>
// Launches pi --fork <session-id> with new CWD

#[tauri::command]
async fn pi_resume_session(
    state: State<'_, AppState>,
    session_file: String,
) -> Result<Uuid, BridgeError>
// Launches pi --continue or pi --session <id>

#[tauri::command]
async fn pi_export_session(
    session_file: String,
    output_path: String,
) -> Result<(), BridgeError>
// Runs pi --export <session_file> -o <output_path>

#[tauri::command]
async fn pi_delete_session(
    session_file: String,
) -> Result<(), BridgeError>
// Deletes the .jsonl file (with confirmation)
```

---

## 4. REAL-TIME EXECUTION VISUALIZATION

### 4.1 Event-to-UI Mapping

This is the **killer feature** of Pi-first Bridge. Instead of showing raw terminal output, Bridge shows a **structured execution view**:

```
┌──────────────────────────────────────────────────────────────────┐
│  🧠 Pi Session — web-dev-cody                    ● thinking     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Turn 1 ──────────────────────────────────────────────────┐   │
│  │                                                            │   │
│  │  👤 you (14:23:01)                                        │   │
│  │  ┌──────────────────────────────────────────────────┐     │   │
│  │  │ Add an about page with Next.js App Router and      │     │   │
│  │  │ link it in the header navigation.                 │     │   │
│  │  └──────────────────────────────────────────────────┘     │   │
│  │                                                            │   │
│  │  🤖 pi · glm-5v-turbo · medium thinking                   │   │
│  │                                                            │   │
│  │  🧠 Thinking...                                            │   │
│  │  ┌──────────────────────────────────────────────────┐     │   │
│  │  │ The user wants to add an about page using Next.js  │     │   │
│  │  │ App Router. Let me first check the existing route  │     │   │
│  │  │ structure to understand the layout...              │     │   │
│  │  └──────────────────────────────────────────────────┘     │   │
│  │                                                            │   │
│  │  🔧 📦 read → src/app/layout.tsx                    ✅     │   │
│  │  🔧 📦 find → **/page.tsx                          ✅     │   │
│  │  🔧 📦 read → src/app/page.tsx                      ✅     │   │
│  │                                                            │   │
│  │  📝 Creating about page...                                 │   │
│  │  🔧 ✏️ write → src/app/about/page.tsx               ✅     │   │
│  │                                                            │   │
│  │  🔧 📦 read → components/Header.tsx                   ✅     │   │
│  │  🔧 ✏️ edit → components/Header.tsx (+8 lines)        ✅     │   │
│  │                                                            │   │
│  │  📝 Running type checker...                                │   │
│  │  💻 bash → npx tsc --noEmit                        ✅ 0s   │   │
│  │                                                            │   │
│  │  ┌──────────────────────────────────────────────────┐     │   │
│  │  │ ✓ Created about page (42 lines)                   │     │   │
│  │  │ ✓ Added About link to navigation (8 lines added)  │     │   │
│  │  │ ✓ Type check passed — 0 errors                    │     │   │
│  │  │ → 3 files changed. Ready for review.              │     │   │
│  │  └──────────────────────────────────────────────────┘     │   │
│  │                                                            │   │
│  │  ⏱ 12.4s  ·  📊 18.5k tokens  ·  💰 $0.003              │   │
│  │                                                            │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                  │
│                         [🔄 New Turn]  [📋 View Raw Terminal]   │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Component Architecture for Visualization

```svelte
<!-- PiExecutionView.svelte — The main structured view -->
<div class="pi-execution">
  {#each session.turns as turn (turn.id)}
    <TurnCard {turn} />

    <!-- Live streaming updates animate in place -->
    {#if turn.is_current}
      <ThinkingBubble text={live.thinking_text} />
      <ToolCallList calls={live.active_tool_calls} />
      <StreamingText text={live.text_so_far} />
    {/if}
  {/each}
</div>

<!-- Sub-components: -->

<!-- ThinkingBubble.svelte — Animated thinking indicator with streaming text -->
<div class="thinking-bubble">
  <span class="thinking-icon">🧠</span>
  <span class="thinking-text">{streaming_text}</span>
  <div class="thinking-progress" style="width: {progress}%" />
</div>

<!-- ToolCallCard.svelte — Shows a single tool invocation -->
<div class="tool-call-card" class:active={in_progress} class:done={completed}>
  <div class="tool-header">
    <span class="tool-icon">{tool_icon(tool_name)}</span>  <!-- 📦read, ✏️edit, 💻bash, 📝write -->
    <span class="tool-name">{tool_name}</span>
    <span class="tool-target">→ {target_path_or_command}</span>
    <span class="tool-status">{spinner / check / cross}</span>
  </div>
  {#if expanded}
    <pre class="tool-args">{format_arguments(arguments)}</pre>
    {#if result !== null}
      <pre class="tool-result">{format_result(result)}</pre>
    {/if}
  {/if}
</div>

<!-- TurnMetrics.svelte — Cost/time/token summary for completed turn -->
<div class="turn-metrics">
  <span>⏱ {duration}</span>
  <span>📊 {tokens.toLocaleString()} tokens</span>
  <span>💰 ${cost.toFixed(4)}</span>
  <span>🔧 {tool_count} tool calls</span>
</div>
```

### 4.3 Tool Icon Map

```typescript
const TOOL_META: Record<string, { icon: string; label: string; color: string }> = {
  'read':     { icon: '📦', label: 'Read',     color: 'var(--cargo-blue)' },
  'write':    { icon: '📝', label: 'Write',    color: 'var(--sea-green)' },
  'edit':     { icon: '✏️', label: 'Edit',     color: 'var(--brass)' },
  'bash':     { icon: '💻', label: 'Bash',     color: 'var(--crew-purple)' },
  'grep':     { icon: '🔍', label: 'Grep',     color: 'var(--bridge-glow)' },
  'find':     { icon: '🔎', label: 'Find',     color: 'var(--bridge-glow)' },
  'ls':       { icon: '📂', label: 'List',     color: 'var(--text-dim)' },
  'fetch_content': { icon: '🌐', label: 'Fetch',   color: 'var(--radar-green)' },
  'web_search':    { icon: '🔭', label: 'Search',  color: 'var(--radar-green)' },
};
```

---

## 5. COST TRACKING DASHBOARD

Since Pi returns token usage and cost in **every response**, Bridge accumulates this:

### 5.1 Data Collection Points

Every `message_end` event with `role: "assistant"` contains:

```json
{
  "usage": {
    "input": 7071,
    "output": 202,
    "cacheRead": 11374,
    "cacheWrite": 0,
    "totalTokens": 18647,
    "cost": {
      "input": 0,
      "output": 0,
      "cacheRead": 0,
      "cacheWrite": 0,
      "total": 0
    }
  }
}
```

### 5.2 What Bridge Tracks

```
┌─────────────────────────────────────────────────────────────┐
│  💰 Fleet Cost Tracker — Today                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Total Today:        $0.127                                  │
│  This Week:          $2.841                                  │
│  This Month:         $12.63                                  │
│                                                             │
│  ┌──────────────────┬────────┬───────┬────────┬──────────┐  │
│  │ Vessel            │ Tokens │ Turns │ Tools  │ Cost     │  │
│  ├──────────────────┼────────┼───────┼────────┼──────────┤  │
│  │ 🚢 web-dev-cody  │ 185k   │ 12    │ 47     │ $0.089   │  │
│  │ 🚢 dialysispal   │ 89k    │ 5     │ 23     │ $0.031   │  │
│  │ 🚢 idea_factory  │ 244k   │ 18    │ 62     │ $0.007   │  │
│  └──────────────────┴────────┴───────┴────────┴──────────┘  │
│                                                             │
│  Cost by Provider:                                          │
│  ████████████████████ zai (glm-5v)    $0.084  (66%)        │
│  ██████ anthropic (sonnet)            $0.033  (26%)         │
│  █ openai (gpt-4o)                   $0.010  (8%)          │
│                                                             │
│  Cost by Tool:                                               │
│  ██████████████████ read            134 calls                │
│  █████████████ edit                 67 calls                 │
│  ███████ write                      23 calls                 │
│  ███ bash                           41 calls                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.3 Persistence

Cost data is accumulated in-memory and persisted to SQLite alongside feed entries:

```sql
CREATE TABLE IF NOT EXISTS session_metrics (
    id              TEXT PRIMARY KEY,
    pi_session_id   TEXT NOT NULL UNIQUE,
    vessel_id       TEXT,
    session_file    TEXT,
    created_at      TEXT NOT NULL,
    ended_at        TEXT,

    -- Totals
    total_tokens    INTEGER DEFAULT 0,
    total_cost      REAL DEFAULT 0,
    turn_count      INTEGER DEFAULT 0,
    tool_count      INTEGER DEFAULT 0,

    -- Breakdowns (JSON)
    tool_breakdown  TEXT DEFAULT '{}',   -- {"read": 10, "edit": 5}
    provider_costs  TEXT DEFAULT '{}',   -- {"zai": 0.05, "anthropic": 0.02}
    files_touched   TEXT DEFAULT '[]',   -- ["src/a.ts", "src/b.ts"]
    model_used      TEXT,
    provider_used   TEXT
);

CREATE INDEX IF NOT EXISTS idx_metrics_vessel ON session_metrics(vessel_id);
CREATE INDEX IF NOT EXISTS idx_metrics_date ON session_metrics(created_at DESC);
```

---

## 6. PER-VESSEL PI CONFIGURATION

Each vessel (project) can have its own Pi launch configuration. This is managed via the **Helm (Settings)** panel, but on a per-vessel basis:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VesselPiConfig {
    // Inherit from global? If true, unset fields fall back to BridgeConfig
    pub inherit_global: bool,              // Default: true

    // Overrides (None = use inherited/global value)
    pub provider: Option<String>,
    pub model: Option<String>,
    pub thinking_level: Option<String>,

    // Tool control per vessel
    pub allowed_tools: Option<Vec<String>>,
    pub denied_tools: Option<Vec<String>>,

    // Skills/extensions specific to this project
    pub vessel_skills: Vec<String>,         // Skill paths relative to project
    pub vessel_extensions: Vec<String>,      // Extension paths relative to project

    // Project-specific context
    pub auto_context_files: Vec<String>,    // Always-attached files (e.g., CLAUDE.md)

    // Defaults for quick-launch
    pub default_prompt_template: Option<String>,
    pub pre_launch_hook: Option<String>,     // Bash command before launching Pi
}
```

**UI: Vessel Settings Panel (accessible from vessel card ⚙️)**

```
┌──────────────────────────────────────────────┐
│  🚢 web-dev-cody — Configuration            │
├──────────────────────────────────────────────┤
│                                              │
│  Model                                        │
│  ┌──────────────────────────┐ ┌───────────┐  │
│  │ Provider: [zai      ▼]  │ │ [Global]  │  │
│  │ Model:   [glm-5v-turb▼]  │ │ ☑ Inherit│  │
│  │ Thinking:[medium    ▼]  │ └───────────┘  │
│  └──────────────────────────┘                │
│                                              │
│  Tools                                        │
│  ☑ Read   ☑ Write  ☑ Edit  ☑ Bash          │
│  ☑ Grep   ☑ Find   ☑ Ls                    │
│  ☐ Allow all  ☐ Deny all                   │
│                                              │
│  Project Skills                               │
│  + Add skill path                             │
│  📄 ./nextjs.sk (Next.js patterns)           │
│  📄 ./testing.sk (Test-driven development)   │
│                                              │
│  Auto-attach Files                            │
│  📄 AGENTS.md                                │
│  📄 CLAUDE.md                                │
│  + Add file                                   │
│                                              │
│  Quick Actions                                │
│  Default task: [Feature implementation  ▼]   │
│  Pre-launch:  [npm install        _______]   │
│                                              │
│                              [Save] [Reset]  │
└──────────────────────────────────────────────┘
```

---

## 7. LAUNCH FLOWS

### 7.1 Quick Launch (Most Common)

User clicks "▶ Launch Pi" on a vessel card → Bridge launches with vessel's saved config:

```
User clicks ▶ on vessel "web-dev-cody"
  │
  ├─ Read VesselPiConfig for this vessel
  ├─ Resolve inherited values from global BridgeConfig
  ├─ Build command line args:
  │   pi --mode json
  │      --provider zai --model glm-5v-turbo --thinking medium
  │      -p "Implement the feature described in the ticket"
  │      --skill ./nextjs.sk
  │      @AGENTS.md @CLAUDE.md
  │      --session-dir /tmp/bridge-sessions/web-dev-cody/
  ├─ Spawn process with CWD = vessel.path
  ├─ Create PiSession record in AppState
  ├─ Start JSONL stdout reader thread
  │   ├─ Parse each line → match event type
  │   ├─ Update PiSession.metrics in real-time
  │   └─ Emit structured events to frontend:
  │      'pi-thinking-start' { session_id, text }
  │      'pi-tool-call'    { session_id, tool_name, args }
  │      'pi-tool-result'  { session_id, tool_name, result }
  │      'pi-text-delta'   { session_id, text }
  │      'pi-turn-end'     { session_id, metrics }
  │      'pi-session-end'  { session_id, final_metrics }
  ├─ Frontend receives events → renders execution view
  └─ On agent_end:
      ├─ Save SessionMetrics to SQLite
      ├─ Update vessel status (check git diff for changes)
      └─ Show completion summary
```

### 7.2 Interactive Terminal Launch

User clicks "🖥 Terminal" tab → gets full PTY-based Pi session:

```
User switches to Station Log tab → clicks "Start Pi"
  │
  ├─ Same config resolution as above
  ├─ But: DON'T pass --mode json or -p
  ├─ Create PTY (default 80x24)
  ├─ Spawn: pi [config args] (interactive, no -p)
  ├─ Connect xterm.js ↔ PTY bridge (terminal.rs)
  │   └─ Standard terminal I/O (bytes in/out)
  ├─ ALSO: Determine session file path Pi will write
  │   └─ Start background file watcher on that JSONL
  │       ├─ Parse new lines as they're written
  │       └─ Emit secondary events for sidebar badges
  │           (tool count, token count, status)
  └─ User interacts with Pi through terminal
      └─ On exit: same cleanup as JSON mode
```

### 7.3 Resume Past Session

User browses session history → clicks "↻ Resume" on a past session:

```
User selects session from history browser
  │
  ├─ Extract pi_session_id from session file
  ├─ Build: pi --session <id> --continue
  │   OR (if just viewing): pi --resume (opens Pi's TUI?)
  │   Actually for Bridge: pi --session <id> -p "new prompt"
  │   OR: pi --fork <id> -p "retry with fixes"
  ├─ Launch as new PiSession (linked to parent via fork_session_id)
  └─ Show in execution view with "Forked from: [parent session]" badge
```

---

## 8. REVISED IPC COMMANDS (PI-SPECIFIC)

### 8.1 Session Management

```rust
// Launch a new Pi session (JSON mode — primary)
#[tauri::command]
async fn pi_launch(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    config: PiLaunchConfig,              // Full launch configuration
) -> Result<Uuid, BridgeError>
// Returns: Bridge's PiSession.id

// Launch interactive PTY session
#[tauri::command]
async fn pi_launch_interactive(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    config: PiLaunchConfig,
) -> Result<Uuid, BridgeError>
// Returns session_id; frontend connects xterm.js via terminal commands

// Send follow-up prompt to running session (PTY mode only)
#[tauri::command]
async fn pi_send_prompt(
    state: State<'_, AppState>,
    session_id: Uuid,
    prompt: String,
) -> Result<(), BridgeError>
// Writes prompt text + newline to PTY

// Stop a running session
#[tauri::command]
async fn pi_stop(
    state: State<'_, AppState>,
    session_id: Uuid,
) -> Result<(), BridgeError>
// SIGTERM → 3s grace → SIGKILL

// List active sessions
#[tauri::command]
async fn pi_list_active(
    state: State<'_, AppState>,
    vessel_id: Option<Uuid>,
) -> Result<Vec<PiSession>, BridgeError>

// Get session detail (including live metrics)
#[tauri::command]
async fn pi_session_detail(
    state: State<'_, AppState>,
    session_id: Uuid,
) -> Result<PiSession, BridgeError>
```

### 8.2 Session History

```rust
#[tauri::command]
async fn pi_history(
    state: State<'_, AppState>,
    vessel_id: Option<Uuid>,
    limit: Option<usize>,
    offset: Option<usize>,
) -> Result<Vec<SessionSummary>, BridgeError>

#[tauri::command]
async fn pi_history_detail(
    state: State<'_, AppState>,
    session_file: String,
) -> Result<PiSessionDetail, BridgeError>

#[tauri::command]
async fn pi_history_fork(
    state: State<'_, AppState>,
    session_file: String,
    vessel_id: Uuid,
    prompt: Option<String>,
) -> Result<Uuid, BridgeError>

#[tauri::command]
async fn pi_history_delete(
    state: State<'_, AppState>,
    session_file: String,
) -> Result<(), BridgeError>

#[tauri::command]
async fn pi_history_export(
    session_file: String,
    output_path: String,
) -> Result<(), BridgeError>
```

### 8.3 Per-Vessel Config

```rust
#[tauri::command]
async fn pi_vessel_config_get(
    state: State<'_, AppState>,
    vessel_id: Uuid,
) -> Result<VesselPiConfig, BridgeError>

#[tauri::command]
async fn pi_vessel_config_set(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    config: VesselPiConfig,
) -> Result<(), BridgeError>

#[tauri::command]
async fn pi_vessel_config_reset(
    state: State<'_, AppState>,
    vessel_id: Uuid,
) -> Result<(), BridgeError>
```

### 8.4 Metrics/Costs

```rust
#[tauri::command]
async fn pi_metrics_vessel(
    state: State<'_, AppState>,
    vessel_id: Uuid,
    period: MetricPeriod,              // Day | Week | Month | All
) -> Result<VesselMetrics, BridgeError>

#[tauri::command]
async fn pi_metrics_fleet(
    state: State<'_, AppState>,
    period: MetricPeriod,
) -> Result<FleetMetrics, BridgeError>

#[derive(Serialize, Deserialize)]
pub enum MetricPeriod { Day, Week, Month, All }

#[derive(Serialize, Deserialize)]
pub struct VesselMetrics {
    pub vessel_id: Uuid,
    pub vessel_name: String,
    pub total_sessions: u32,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub total_turns: u32,
    pub total_tools: u32,
    pub tool_breakdown: HashMap<String, u32>,
    pub daily_breakdown: Vec<DailyMetric>,  // Last 30 days
}

#[derive(Serialize, Deserialize)]
pub struct FleetMetrics {
    pub vessels: Vec<VesselMetrics>,
    pub fleet_total_tokens: u64,
    pub fleet_total_cost: f64,
    pub provider_breakdown: HashMap<String, f64>,
    pub daily_totals: Vec<DailyMetric>,
}

#[derive(Serialize, Deserialize)]
pub struct DailyMetric {
    pub date: String,                    // "2026-05-21"
    pub sessions: u32,
    pub tokens: u64,
    pub cost: f64,
}
```

---

## 9. EVENTS EMITTED TO FRONTEND (REVISED)

```
Event Name                    Payload                          | When
------------------------------|----------------------------------|----------------------------------
'pi-session-started'          PiSession                        | Process spawned, first event received
'pi-status-changed'           {session_id, old_status, new_status} | Status transition
'pi-thinking-start'           {session_id, text_preview}       | thinking_start event
'pi-thinking-delta'           {session_id, delta_text}         | thinking_delta event
'pi-thinking-end'             {session_id, full_thinking}       | thinking_end event
'pi-text-start'               {session_id}                    | text_start event
'pi-text-delta'               {session_id, delta_text}         | text_delta event
'pi-text-end'                 {session_id, full_text}          | text_end event
'pi-tool-call-start'          {session_id, tool_name, args_preview} | toolcall_start
'pi-tool-call-delta'          {session_id, delta_args}          | toolcall_delta
'pi-tool-call-end'            {session_id, tool_name, full_args} | toolcall_end
'pi-tool-result'              {session_id, tool_name, result_preview, success} | toolResult msg
'pi-turn-start'               {session_id, turn_number}         | turn_start
'pi-turn-end'                 {session_id, metrics}             | turn_end (with usage)
'pi-session-end'              {session_id, final_metrics}       | agent_end
'pi-session-error'             {session_id, error_message}       | Process error/crash
'pi-cost-update'              {session_id, running_cost}        | Throttled (every 5s during session)
'vessel-status-changed'       Vessel                           | Git status changed (unchanged)
'feed-event'                  FeedEntry                        | (unchanged —通用)
```

---

## 10. WHAT CHANGES FROM ORIGINAL SPEC

| Aspect | Original (Generic Agents) | Revised (Pi-First) |
|--------|--------------------------|---------------------|
| **Agent type** | Enum: ClaudeCode, Codex, CursorCli | Single: Pi (with modes) |
| **Terminal I/O** | Only PTY/raw bytes | Primary: JSON event stream; Secondary: PTY |
| **Session visibility** | Black box (raw terminal) | Fully structured (thinking, tools, text) |
| **History** | Not addressed | Full session browser (read Pi's JSONL) |
| **Cost tracking** | Not possible | Built-in (every response has usage data) |
| **Per-project config** | Basic (binary paths) | Rich (model, tools, skills, thinking, context) |
| **Session lifecycle** | Start/stop only | Start, stop, resume, fork, export, delete |
| **Visualization** | Terminal window | Structured execution view (turns, tools, thinking) |
| **Complexity** | Lower (dumb pipe) | Higher (smarter, more value) |
| **Differentiation** | Same as Warp/iTerm2 tabs | **Unique** — no other Pi GUI exists |

---

## 11. IMPLEMENTATION PRIORITY ADJUSTMENT

### Phase 1: Core Pi Integration (Days 1-4)

1. **`pi.rs` module** — JSON mode launcher + stdout parser
2. **Event parser** — Complete JSONL event type handling (all sub-events)
3. **Basic execution view** — Turn cards + thinking bubble + tool call list
4. **Session metrics accumulation** — Real-time token/cost tracking
5. **Vessel sidebar** — With Pi-specific status badges (running, thinking, tool-active)

### Phase 2: History & Config (Days 5-6)

6. **Session history browser** — Scan/read Pi's JSONL session files
7. **Session detail view** — Reconstruct conversation from JSONL
8. **Fork/resume** — Launch pi --fork / pi --continue
9. **Per-vessel Pi config** — Model, tools, skills per project
10. **Helm panel** — Global + per-vessel settings UI

### Phase 3: Git Ship + Polish (Days 7-9)

11. **Diff viewer** (unchanged from original spec)
12. **Set Sail flow** (unchanged)
13. **Cost tracker dashboard** — Daily/weekly/monthly breakdowns
14. **Interactive PTY mode** — xterm.js fallback for power users
15. **Engine room** — Dev server runners (unchanged)

### Phase 4: Shine (Day 10)

16. **Keyboard shortcuts** — Cmd+Shift+P (quick launch), Cmd+H (history)
17. **Session export/share** — HTML export from Pi
18. **Notification system** — OS notifications when long sessions complete
19. **Quick-launch templates** — Saved prompt templates per vessel
20. **Edge cases** — All from backend deep-dive doc

---

## 12. OPEN QUESTIONS

1. **RPC mode**: Pi has `--mode rpc`. Should we investigate if this enables two-way communication (sending prompts to a running Pi process)? This could replace PTY mode entirely for interactive use.

2. **Session dir isolation**: Should Bridge use its own `--session-dir` so Bridge-launched sessions don't mix with manually-launched Pi sessions? Recommendation: **Yes**, use `~/.pi/agent/sessions-bridge/` or similar.

3. **Concurrent session limits**: Pi itself may have limits. Should Bridge enforce a max (e.g., 3 concurrent Pi sessions per vessel, 10 fleet-wide)?

4. **Credential management**: Pi uses env vars for API keys. Should Bridge offer a secure vault (OS keyring) for these, or rely on the user's existing shell environment?

5. **Offline mode**: Pi has `--offline`. Should Bridge detect network state and auto-enable this?

6. **Sharing**: Pi has `PI_SHARE_VIEWER_URL` for session sharing. Should Bridge integrate shareable links into the session detail view?
