# Deep Dive 2: Session History Browser

> **Bridge × Pi Integration — Browse, search, replay, and manage past sessions**
> **Status:** Implementation-ready spec + UX interaction design
> **Data source:** Pi's JSONL session files at `~/.pi/agent/sessions/<cwd>/`

---

## 1. THE PROBLEM

Pi automatically saves every session as a **JSONL file**. Right now, the only way to review past sessions is:
- `pi --resume` (TUI picker — text-only, no visualization)
- Opening raw `.jsonl` files in a text editor
- `pi --export` (HTML export — one-way, no interaction)

Bridge should make session history a **first-class citizen** — like an email client for AI conversations.

---

## 2. DATA SOURCE: PI SESSION FILES

### 2.1 File Layout

```
~/.pi/agent/sessions/
├── --Users-alex-Projects-my-app--/
│   ├── 2026-05-21T09-55-16-616Z_019e49f5....jsonl   (105 KB)
│   ├── 2026-05-21T09-58-46-132Z_019e49f9....jsonl   (583 KB)
│   └── 2026-05-21T11-26-24-280Z_019e4a4....jsonl   (  2 KB)
├── --Users-alex-Projects-other-project--/
│   └── ...
└── --Users-alex-Downloads-some-dir--/
    └── ...
```

**Encoding:** Directory names are URL-encoded CWD paths.
**File names:** `<ISO8601-timestamp>_<uuid>.jsonl`
**Content:** One JSON object per line (see Deep Dive 1 for event types)

### 2.2 What We Can Extract Without Reading the Full File

For list/search performance, we only read the **first N lines** of each file to build summary info:

| Line | Event Type | Data Extracted |
|------|-----------|----------------|
| 1 | `session` | pi_session_id, cwd, timestamp |
| 2 | `model_change` (optional) | provider, model |
| First `message` with role=`user` | User message | Preview text (first 120 chars) |
| Count all lines | — | message_count estimate |
| File size | `metadata` | file_size_bytes |
| Modified time | `metadata` | last_modified |

**Target: < 5ms per session for list view** (read first ~10 lines + stat call)

---

## 3. RUST BACKEND

### 3.1 Data Structures

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ═══════════════════════════════════════════
// SUMMARY — Lightweight record for list views
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSummary {
    // Identity
    pub pi_session_id: String,
    pub session_file: PathBuf,           // Absolute path to .jsonl
    pub vessel_id: Option<Uuid>,          // Matched by cwd → vessel registry

    // Temporal
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub duration_ms: Option<u64>,         // Computed from first/last event timestamps

    // Content preview
    pub preview_text: Option<String>,     // First user message (truncated)
    pub turn_count: u32,
    pub message_count: u32,

    // Model info
    pub provider: Option<String>,
    pub model: Option<String>,
    pub thinking_level: Option<String>,

    // Quick stats (from scanning events)
    pub tool_call_count: u32,
    pub has_error: bool,
    pub total_tokens: Option<u64>,
    pub total_cost: Option<f64>,

    // File metadata
    pub file_size_bytes: u64,

    // Vessel match info
    pub cwd: String,
}

// ═══════════════════════════════════════════
// DETAIL — Full reconstructed session
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDetail {
    pub summary: SessionSummary,

    // Reconstructed conversation
    pub turns: Vec<HistoricalTurn>,
    pub metrics: SessionMetrics,

    // Raw event count
    pub event_count: u32,

    // Files referenced in this session
    pub files_referenced: Vec<FileReference>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalTurn {
    pub index: u32,
    pub user_message: Option<String>,
    pub assistant_messages: Vec<AssistantMessageBlock>,  // Multiple per turn (tool round-trips)
    pub thinking: Option<String>,
    pub tool_calls: Vec<HistoricalToolCall>,
    pub started_at: DateTime<Utc>,
    pub ended_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<u64>,
    pub tokens: Option<u64>,
    pub cost: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantMessageBlock {
    pub thinking: Option<String>,
    pub text: Option<String>,
    pub tool_calls: Vec<HistoricalToolCall>,  // Tool calls within this block
    pub usage: Option<PiUsage>,
    pub stop_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalToolCall {
    pub name: String,
    pub arguments: serde_json::Value,
    pub result_preview: Option<String>,
    pub result_is_error: bool,
    pub started_at: Option<DateTime<Utc>>,
    pub ended_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileReference {
    pub path: String,                    // Relative to project root
    pub action: FileAction,              // Read | Written | Edited | BashCwd
    pub tool_name: String,
    pub turn_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FileAction { Read, Written, Edited, BashCwd }

// ═══════════════════════════════════════════
// SEARCH / FILTER
// ═══════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionQuery {
    pub vessel_id: Option<Uuid>,        // Filter to specific project
    pub query: Option<String>,          // Full-text search in messages
    pub tool_filter: Option<String>,    // Filter by tool used (e.g., "bash")
    pub has_error: Option<bool>,        // Error-only sessions
    pub date_from: Option<DateTime<Utc>>,
    pub date_to: Option<DateTime<Utc>>,
    pub provider_filter: Option<String>,
    pub model_filter: Option<String>,
    pub min_turns: Option<u32>,
    pub min_tokens: Option<u64>,
    pub sort_by: SessionSortBy,
    pub sort_order: SortOrder,
    pub limit: usize,
    pub offset: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SessionSortBy {
    Newest,                            // Default
    Oldest,
    MostTokens,
    LeastTokens,
    LongestDuration,
    ShortestDuration,
    MostTools,
    MostCostly,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SortOrder { Asc, Desc }
```

### 3.2 Scanner Module (`session_scan.rs`)

```rust
/// Scans Pi's session directory structure and builds summaries.
///
/// Strategy:
/// 1. List all subdirectories under ~/.pi/agent/sessions/
/// 2. In each subdirectory, list all .jsonl files
/// 3. For each file, read only the header lines + file stats
/// 4. Match CWD to registered vessels
/// 5. Return sorted summaries

pub fn scan_all_sessions(
    session_dir: &Path,
    vessels: &HashMap<Uuid, Vessel>,
) -> Result<Vec<SessionSummary>, BridgeError> {
    if !session_dir.exists() {
        return Ok(Vec::new()); // No sessions yet — valid state
    }

    let mut summaries = Vec::new();

    for entry in fs::read_dir(session_dir).map_err(|e| BridgeError::IoError(e.into()))? {
        let entry = entry?;
        let cwd_dir = entry.path();

        // Skip non-directories
        if !cwd_dir.is_dir() { continue; }

        // Decode CWD from directory name
        let cwd = url_decode(cwd_dir.file_name().unwrap_or_default().to_string_lossy());

        // Match to vessel
        let vessel_id = vessels.iter()
            .find(|(_, v)| v.path == PathBuf::from(&cwd))
            .map(|(id, _)| *id);

        // Scan each .jsonl file in this directory
        for file_entry in fs::read_dir(&cwd_dir)? {
            let file = file_entry?.path();
            if file.extension().map_or(false, |ext| ext == "jsonl") {
                if let Some(summary) = scan_session_file(&file, &cwd, vessel_id)? {
                    summaries.push(summary);
                }
            }
        }
    }

    // Sort: newest first
    summaries.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(summaries)
}

/// Scan a single session file — reads only what's needed for summary.
fn scan_session_file(
    path: &Path,
    cwd: &str,
    vessel_id: Option<Uuid>,
) -> Result<Option<SessionSummary>, BridgeError> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let metadata = fs::metadata(path)?;

    let mut summary = None;
    let mut line_count: u32 = 0;
    let mut tool_count: u32 = 0;
    let mut has_error = false;
    let mut first_user_msg: Option<String> = None;
    let mut total_tokens: Option<u64> = None;
    let mut total_cost: Option<f64> = None;
    let mut provider: Option<String> = None;
    let mut model: Option<String> = None;
    let mut thinking_level: Option<String> = None;
    let mut first_ts: Option<DateTime<Utc>> = None;
    let mut last_ts: Option<DateTime<Utc>> = None;
    let mut turn_count: u32 = 0;

    // Only read up to HEADER_SCAN_LINES for summary (performance)
    // But we also need to count tools/errors which may be deeper
    // Compromise: read entire file but stream-parse (JSONL is fast)
    for line_result in reader.lines() {
        let line = line_result.map_err(|e| BridgeError::IoError(e.to_string()))?;
        line_count += 1;

        if line.trim().is_empty() { continue; }

        let value: serde_json::Value = serde_json::from_str(&line)
            .unwrap_or_else(|_| serde_json::Value::Null);

        let t = value.get("type").and_then(|v| v.as_str()).unwrap_or("?");

        match t {
            "session" => {
                summary = Some(SessionSummary {
                    pi_session_id: value.get("id").and_then(|v| v.as_str()).unwrap_or_default().into(),
                    session_file: path.to_path_buf(),
                    vessel_id,
                    created_at: value.get("timestamp").and_then(|v| v.as_str())
                        .and_then(|s| DateTime::parse_from_rfc3339(s).ok()).map(|dt| dt.with_timezone(&Utc)),
                    modified_at: metadata.modified().ok().and_then(|t| DateTime::from_timestamp(t_secs.len(), 0)),
                    duration_ms: None, // Will compute after full scan
                    preview_text: None,
                    turn_count: 0,
                    message_count: 0,
                    provider: None,
                    model: None,
                    thinking_level: None,
                    tool_call_count: 0,
                    has_error: false,
                    total_tokens: None,
                    total_cost: None,
                    file_size_bytes: metadata.len(),
                    cwd: cwd.into(),
                });
                first_ts = value.get("timestamp").and_then(|v| v.as_str())
                    .and_then(|s| DateTime::parse_from_rfc3339(s).ok()).map(|dt| dt.with_timezone(&Utc));
            }

            "model_change" => {
                provider = value.get("provider").and_then(|v| v.as_str()).map(String::from);
                model = value.get("modelId").and_then(|v| v.as_str()).map(String::from);
            }

            "thinking_level_change" => {
                thinking_level = value.get("thinkingLevel").and_then(|v| v.as_str()).map(String::from);
            }

            "message" => {
                // Extract preview from first user message
                if first_user_msg.is_none() {
                    if let Some(msg) = value.get("message") {
                        if msg.get("role").and_then(|r| r.as_str()) == Some("user") {
                            first_user_msg = extract_preview_text(msg);
                        }
                    }
                }

                // Count tool calls from stored messages
                if let Some(msg) = value.get("message") {
                    if let Some(content) = msg.get("content").and_then(|c| c.as_array()) {
                        for part in content {
                            if part.get("type").and_then(|t| t.as_str()) == Some("toolCall") {
                                tool_count += 1;
                            }
                        }
                    }
                }

                // Check for errors in tool results
                if let Some(msg) = value.get("message") {
                    if msg.get("role").and_then(|r| r.as_str()) == Some("toolResult") {
                        if msg.get("isError").and_then(|e| e.as_bool()) == Some(true) {
                            has_error = true;
                        }
                    }
                }

                // Accumulate tokens/cost from assistant messages
                if let Some(msg) = value.get("message") {
                    if msg.get("role").and_then(|r| r.as_str()) == Some("assistant") {
                        if let Some(usage) = msg.get("usage") {
                            let tokens = usage.get("totalTokens").and_then(|t| t.as_u64()).unwrap_or(0);
                            let cost = usage.get("cost")
                                .and_then(|c| c.get("total")).and_then(|t| t.as_f64()).unwrap_or(0.0);
                            total_tokens = Some(total_tokens.unwrap_or(0) + tokens);
                            total_cost = Some(total_cost.unwrap_or(0.0) + cost);
                        }
                    }
                }

                message_count += 1;
            }

            _ => {}
        }

        last_ts = None; // Would need timestamp on every event — approximate with file mtimes
    }

    // Update summary with accumulated data
    if let Some(ref mut s) = summary {
        s.preview_text = first_user_msg;
        s.tool_call_count = tool_count;
        s.has_error = has_error;
        s.total_tokens = total_tokens;
        s.total_cost = total_cost;
        s.provider = provider;
        s.model = model;
        s.thinking_level = thinking_level;
        s.message_count = line_count;
        // Estimate turns: roughly (user messages + assistant messages) / 2
        s.turn_count = turn_count.max(line_count / 4); // Rough heuristic
        s.duration_ms = first_ts.and_then(|start|
            last_ts.or(Some(Utc::now())).map(|end|
                (end - start).num_milliseconds().max(0) as u64
            )
        );
    }

    Ok(summary)
}
```

### 3.3 Detail Reader (`session_read.rs`)

```rust
/// Fully parse a session JSONL file into a structured SessionDetail.
///
/// This is more expensive than scanning — reads the entire file.
/// Used when user clicks on a session in the browser.
pub fn read_session_detail(
    session_file: &Path,
    vessels: &HashMap<Uuid, Vessel>,
) -> Result<SessionDetail, BridgeError> {
    let file = File::open(session_file)?;
    let reader = BufReader::new(file);

    let mut summary: Option<SessionSummary> = None;
    let mut current_turn: Option<HistoricalTurn> = None;
    let mut turns: Vec<HistoricalTurn> = Vec::new();
    let mut metrics = SessionMetrics::default();
    let mut files: HashSet<FileReference> = HashSet::new();

    for line_result in reader.lines() {
        let line = line_result?;
        if line.trim().is_empty() { continue; }

        let value: serde_json::Value = serde_json::from_str(&line)?;

        match value.get("type").and_then(|t| t.as_str()).unwrap_or("?") {
            "session" => {
                // Build summary inline (or we could call scan_session_file separately)
            }

            "message" => {
                if let Some(msg) = value.get("message") {
                    let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("");

                    match role {
                        "user" => {
                            // Finalize previous turn if exists
                            if let Some(mut turn) = current_turn.take() {
                                turn.ended_at = value.get("timestamp")
                                    .and_then(|ts| ts.as_str())
                                    .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                                    .map(|dt| dt.with_timezone(&Utc));
                                turns.push(turn);
                            }

                            current_turn = Some(HistoricalTurn {
                                index: turns.len() as u32,
                                user_message: extract_full_text(msg),
                                assistant_messages: Vec::new(),
                                thinking: None,
                                tool_calls: Vec::new(),
                                started_at: value.get("timestamp")
                                    .and_then(|ts| ts.as_str())
                                    .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                                    .map(|dt| dt.with_timezone(&Utc)),
                                ended_at: None,
                                duration_ms: None,
                                tokens: None,
                                cost: None,
                            });
                            metrics.user_message_count += 1;
                        }

                        "assistant" => {
                            // Parse content parts
                            let mut block = AssistantMessageBlock {
                                thinking: None,
                                text: None,
                                tool_calls: Vec::new(),
                                usage: None,
                                stop_reason: msg.get("stopReason")
                                    .and_then(|sr| sr.as_str()).map(String::from),
                            };

                            if let Some(usage_val) = msg.get("usage") {
                                block.usage = serde_json::from_value(usage_val.clone()).ok();
                                if let Some(ref usage) = block.usage {
                                    metrics.total_input_tokens += usage.input;
                                    metrics.total_output_tokens += usage.output;
                                    metrics.total_tokens += usage.input + usage.output;
                                    if let Some(cost) = &usage.cost {
                                        metrics.total_cost_usd += cost.total;
                                    }
                                }
                            }

                            if let Some(content) = msg.get("content").and_then(|c| c.as_array()) {
                                for part in content {
                                    match part.get("type").and_then(|t| t.as_str()).unwrap_or("") {
                                        "thinking" => {
                                            block.thinking = part.get("thinking")
                                                .and_then(|t| t.as_str()).map(String::from);
                                            if let Some(ref mut turn) = current_turn {
                                                turn.thinking = block.thinking.clone();
                                            }
                                        }
                                        "text" => {
                                            block.text = part.get("text")
                                                .and_then(|t| t.as_str()).map(String::from);
                                            if let Some(ref mut turn) = current_turn {
                                                turn.response_text = Some(block.text.clone().unwrap_or_default());
                                            }
                                        }
                                        "toolCall" => {
                                            let tc = HistoricalToolCall {
                                                name: part.get("name")
                                                    .and_then(|n| n.as_str()).unwrap_or("unknown").into(),
                                                arguments: part.get("arguments")
                                                    .cloned().unwrap_or(serde_json::Value::Null),
                                                result_preview: None,
                                                result_is_error: false,
                                                started_at: None,
                                                ended_at: None,
                                            };
                                            // Track file references
                                            track_file_refs(&tc, &mut files, turns.len() as u32);
                                            block.tool_calls.push(tc);
                                            metrics.tool_call_count += 1;
                                        }
                                        _ => {}
                                    }
                                }
                            }

                            if let Some(ref mut turn) = current_turn {
                                turn.assistant_messages.push(block);
                            }
                        }

                        "toolResult" => {
                            // Attach result to the most recent unmatched tool call
                            let tool_call_id = msg.get("toolCallId")
                                .and_then(|id| id.as_str()).unwrap_or("");
                            let tool_name = msg.get("toolName")
                                .and_then(|n| n.as_str()).unwrap_or("");
                            let is_error = msg.get("isError")
                                .and_then(|e| e.as_bool()).unwrap_or(false);
                            let preview = extract_result_preview(msg);

                            // Find and update the tool call in current turn
                            if let Some(ref mut turn) = current_turn {
                                for block in &mut turn.assistant_messages {
                                    for tc in &mut block.tool_calls {
                                        if tc.name == tool_name /* best-effort match */ {
                                            tc.result_preview = preview.clone();
                                            tc.result_is_error = is_error;
                                            break;
                                        }
                                    }
                                }
                                turn.tool_calls.iter_mut().for_each(|tc| {
                                    if tc.result_preview.is_none() && tc.name == tool_name {
                                        tc.result_preview = preview.clone();
                                        tc.result_is_error = is_error;
                                    }
                                });
                            }

                            if is_error { metrics.error_count += 1; }
                        }

                        _ => {}
                    }
                }
            }

            _ => {} // Ignore other event types in detail mode (they're embedded in 'message' events)
        }
    }

    // Don't forget the last turn
    if let Some(mut turn) = current_turn.take() {
        turn.ended_at = Utc::now().into(); // Approximate
        turns.push(turn);
    }

    metrics.turn_count = turns.len() as u32;

    Ok(SessionDetail {
        summary: summary.unwrap_or_else(|| SessionSummary {
            pi_session_id: String::new(),
            session_file: session_file.to_path_buf(),
            vessel_id: None,
            created_at: Utc::now(),
            modified_at: Utc::now(),
            duration_ms: None,
            preview_text: None,
            turn_count: 0,
            message_count: 0,
            provider: None,
            model: None,
            thinking_level: None,
            tool_call_count: 0,
            has_error: false,
            total_tokens: None,
            total_cost: None,
            file_size_bytes: 0,
            cwd: String::new(),
        }),
        turns,
        metrics,
        event_count: 0, // Could count lines
        files_referenced: files.into_iter().collect(),
    })
}

fn track_file_refs(tc: &HistoricalToolCall, files: &mut HashSet<FileReference>, turn_idx: u32) {
    match tc.name.as_str() {
        "read" | "edit" | "write" => {
            if let Some(path) = tc.arguments.get("path").or(tc.arguments.get("file_path"))
                .and_then(|p| p.as_str())
            {
                files.insert(FileReference {
                    action: match tc.name.as_str() {
                        "read" => FileAction::Read,
                        "write" => FileAction::Written,
                        "edit" => FileAction::Edited,
                        _ => FileAction::Read,
                    },
                    path: path.into(),
                    tool_name: tc.name.clone(),
                    turn_index: turn_idx,
                });
            }
        }
        "bash" => {
            if let Some(cmd) = tc.arguments.get("command").and_then(|c| c.as_str()) {
                // Extract CWD-ish paths from bash commands (best effort)
                files.insert(FileReference {
                    action: FileAction::BashCwd,
                    path: cmd[..cmd.len().min(80)].into(),
                    tool_name: "bash".into(),
                    turn_index: turn_idx,
                });
            }
        }
        _ => {}
    }
}
```

### 3.4 IPC Commands

```rust
#[tauri::command]
async fn session_list(
    state: State<'_, AppState>,
    query: Option<SessionQuery>,       // Null = default (all, newest-first, limit 50)
) -> Result<Vec<SessionSummary>, BridgeError>
// Returns paginated, sorted, filtered list of session summaries

#[tauri::command]
async fn session_detail(
    state: State<'_, AppState>,
    session_file: String,               // Absolute path to .jsonl file
) -> Result<SessionDetail, BridgeError>
// Full parsed session with turns, metrics, file refs

#[tauri::command]
async fn session_search(
    state: State<'_, AppState>,
    query_string: String,              // Full-text search across all sessions
    limit: Option<usize>,
) -> Result<Vec<SessionSummary>, BridgeError>
// Grep-like search through session content (expensive, use sparingly)

#[tauri::command]
async fn session_fork(
    state: State<'_, AppState>,
    session_file: String,
    vessel_id: Uuid,
    prompt_override: Option<String>,
) -> Result<Uuid, BridgeError>
// Launches: pi --fork <session-id> -p "new prompt"
// Returns new PiSession ID

#[tauri::command]
async fn session_resume(
    state: State<'_, AppState>,
    session_file: String,
) -> Result<Uuid, BridgeError>
// Launches: pi --continue (with session dir set appropriately)

#[tauri::command]
async fn session_export_html(
    session_file: String,
    output_path: String,
) -> Result<(), BridgeError>
// Runs: pi --export <session_file>
// Output goes to output_path

#[tauri::command]
async fn session_delete(
    state: State<'_, AppState>,
    session_file: String,
) -> Result<(), BridgeError>
// Deletes the .jsonl file. Confirmation required from frontend.

#[tauri::command]
async fn session_stats(
    state: State<'_, AppState>,
    vessel_id: Option<Uuid>,
    period: MetricPeriod,
) -> Result<SessionStats, BridgeError>
// Aggregated statistics across sessions

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStats {
    pub total_sessions: u32,
    pub total_files: u64,
    pub total_size_bytes: u64,
    pub unique_models: Vec<String>,
    pub unique_providers: Vec<String>,
    pub avg_turns_per_session: f32,
    pub avg_tokens_per_session: f64,
    pub avg_duration_secs: f64,
    pub error_rate: f32,                   // % of sessions with errors
    pub daily_session_counts: Vec<DailyCount>,
    pub daily_token_counts: Vec<DailyCount>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyCount {
    pub date: String,
    pub count: u64,
}
```

---

## 4. FRONTEND: SESSION BROWSER UI

### 4.1 Layout

```
┌────────────────────────────────────────────────────────────────────┐
│  📚 Captain's Log — Session History                    [⚙ Filter] │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─ Search & Filter Bar ──────────────────────────────────────┐    │
│  │ 🔍 Search sessions...          ▼ All Vessels             │    │
│  │ [All] [Errors] [Today] [This Week] [This Month] [All Time] │    │
│  │ Sort: [Newest ▼]                           127 sessions   │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ Session List (virtual scroll) ─────────────────────────────┐   │
│  │                                                              │   │
│  │ ┌────────────────────────────────────────────────────────┐  │   │
│  │ │ 📄 web-dev-cody · glm-5v · medium · 14:23 Today      │  │   │
│  │ │ "Add an about page with Next.js App Router..."        │  │   │
│  │ │ 3 turns · 18.5k tok · $0.003 · 🔧 12 tools · 12.4s   │  │   │
│  │ │                                          [↻] [🗑] [▶] │  │   │
│  │ ├────────────────────────────────────────────────────────┤  │   │
│  │ │ 📄 web-dev-cody · sonnet:high · 11:05 Today          │  │   │
│  │ │ "Fix the type error in Header component"              │  │   │
│  │ │ 2 turns · 8.2k tok · $0.002 · 🔧 5 tools · 6.1s      │  │   │
│  │ │                                          [↻] [🗑] [▶] │  │   │
│  │ ├────────────────────────────────────────────────────────┤  │   │
│  │ │ 📄 dialysispal · claude-haiku · Yesterday             │  │   │
│  │ │ "Set up the authentication flow..."                   │  │   │
│  │ │ 7 turns · 42k tok · $0.011 · 🔧 23 tools · 34s       │  │   │
│  │ │ ⚠️ 1 error                                       [↻][🗑][▶]│  │   │
│  │ ├────────────────────────────────────────────────────────┤  │   │
│  │ │ 📄 idea_factory · gpt-4o · May 18                     │  │   │
│  │ │ "Refactor the state management..."                     │  │   │
│  │ │ 5 turns · 89k tok · $0.024 · 🔧 31 tools · 1m 02s     │  │   │
│  │ │                                          [↻] [🗑] [▶] │  │   │
│  │ └────────────────────────────────────────────────────────┘  │   │
│ │                                                              │   │
│  ... (virtual scrolled, 1000+ sessions)                          │   │
│ │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─ Stats Footer ─────────────────────────────────────────────┐    │
│  │ 127 sessions · 1.2M tokens · $0.34 total · 15 this week   │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

### 4.2 Session Detail View (Panel Slide-In)

When user clicks a session row:

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Back to list    📄 Session 019e49f5...    [↻ Fork] [📋 Export] │
├──────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─ Session Info Bar ─────────────────────────────────────────┐  │
│  │ 🚢 web-dev-cody  ·  🤖 glm-5v-turbo (zai)  ·  medium     │  │
│  │ 📅 May 21, 2026 at 14:23  ·  ⏱ 12.4s  ·  3 turns        │  │
│  │ 📊 18,526 tokens  ·  💰 $0.00304  ·  🔧 12 tool calls     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─ Turn 1 ────────────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │  👤 Add an about page with Next.js App Router and link...  │  │
│  │                                                             │  │
│  │  🧠 Thinking (collapsible)                                  │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │ The user wants to add an about page using Next.js   │   │  │
│  │  │ App Router. Let me check the existing route...       │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                                                             │  │
│  │  🔧 Tool Calls (12)                                        │  │
│  │  ┌──────────────────────────────────────────────────────┐ │  │
│  │  │ 📦 read  → src/app/layout.tsx                  ✅   │ │  │
│  │  │ 📦 find  → **/page.tsx                         ✅   │ │  │
│  │  │ 📦 read  → src/app/page.tsx                      ✅   │ │  │
│  │  │ ✏️ write → src/app/about/page.tsx                ✅   │ │  │
│  │  │ 📦 read  → components/Header.tsx                 ✅   │ │  │
│  │  │ ✏️ edit  → components/Header.tsx (+8 lines)       ✅   │ │  │
│  │  │ 💻 bash  → npx tsc --noEmit                    ✅ 0s │ │  │
│  │  └──────────────────────────────────────────────────────┘ │  │
│  │                                                             │  │
│  │  📝 Response                                               │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │ ✓ Created about page (42 lines)                     │   │  │
│  │  │ ✓ Added About link to navigation (8 lines added)    │   │  │
│  │  │ ✓ Type check passed — 0 errors                     │   │  │
│  │  │ → 3 files changed. Ready for review.               │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  │                                                             │  │
│  │  ⏱ 8.2s · 📊 12.1k tok · 💰 $0.002 · 🔧 7 tools          │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─ Turn 2 ────────────────────────────────────────────────────┐  │
│  │  ...                                                        │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌─ Files Touched ────────────────────────────────────────────┐  │
│  │  ✏️ src/app/about/page.tsx  (written)                      │  │
│  │  ✏️ src/components/Header.tsx  (edited)                     │  │
│  │  📦 src/app/layout.tsx  (read)                             │  │
│  │  📦 src/app/page.tsx  (read)                               │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 Key Svelte Components

```svelte
<!-- lib/components/History/SessionList.svelte -->
<script lang="ts">
  import type { SessionSummary } from '$lib/types/pi';
  import { VirtualList } from 'svelte-virtual-list';

  interface Props {
    sessions: SessionSummary[];
    selectedId: string | null;
    loading: boolean;
  }

  let { sessions, selectedId, loading }: Props = $props();

  function formatPreview(text: string): string {
    if (text.length > 100) return text.slice(0, 97) + '...';
    return text;
  }

  function timeAgo(dt: Date): string {
    const secs = (Date.now() - dt.getTime()) / 1000;
    if (secs < 60) return 'just now';
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
</script>

{#if loading}
  <div class="loading-state">
    <div class="spinner" /> Scanning sessions...
  </div>
{:else if sessions.length === 0}
  <div class="empty-state">
    <span class="empty-icon">📭</span>
    <p>No sessions found</p>
    <p class="empty-sub">Sessions will appear here as you work with Pi across your fleet.</p>
  </div>
{:else}
  <VirtualList items={sessions} let:item let:index>
    <div
      class="session-row"
      class:selected={selectedId === item.pi_session_id}
      class:error={item.has_error}
    >
      <!-- Main content -->
      <div class="row-main" onclick={() => onSelect(item)}>
        <div class="row-header">
          <span class="row-vessel">{vesselNameFromCwd(item.cwd)}</span>
          <span class="row-model">
            {item.model || 'default'}{#if item.thinking_level} · {item.thinking_level}{/if}
          </span>
          <span class="row-time">{timeAgo(new Date(item.created_at))}</span>
        </div>

        <div class="row-preview">
          "{formatPreview(item.preview_text || '(empty session)')}"
        </div>

        <div class="row-meta">
          <span>{item.turn_count} turns</span>
          <span>·</span>
          <span>{formatTokens(item.total_tokens)} tok</span>
          <span>·</span>
          <span>${item.cost?.toFixed(4) || '0.0000'}</span>
          <span>·</span>
          <span>🔧 {item.tool_call_count} tools</span>
          {#if item.duration_ms !== null}
          <span>·</span>
          <span>⏱ {formatDurationMs(item.duration_ms)}</span>
          {/if}
        </div>
      </div>

      <!-- Actions -->
      <div class="row-actions">
        <button class="action-btn" title="Fork session" onclick={(e) => onFork(item, e)}>
          ↻
        </button>
        <button class="action-btn danger" title="Delete session" onclick={(e) => onDelete(item, e)}>
          🗑
        </button>
        <button class="action-btn primary" title="Resume session" onclick={(e) => onResume(item, e)}>
          ▶
        </button>
      </div>
    </div>
  </VirtualList>
{/if}

<style>
  .session-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--bridge-border);
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .session-row:hover { background: rgba(255,255,255,0.03); }
  .session-row.selected {
    background: rgba(120, 221, 232, 0.06);
    border-left: 2px solid var(--bridge-glow);
  }
  .session-row.error {
    border-left: 2px solid var(--alert-red);
  }

  .row-main { flex: 1; min-width: 0; }
  .row-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.15s; }
  .session-row:hover .row-actions { opacity: 1; }

  .row-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    margin-bottom: 3px;
  }
  .row-vessel {
    font-weight: 600;
    color: var(--foam);
  }
  .row-model {
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .row-time { color: var(--text-faint); margin-left: auto; }

  .row-preview {
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-meta {
    display: flex;
    gap: 6px;
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--text-faint);
    margin-top: 4px;
  }

  .action-btn {
    width: 26px;
    height: 26px;
    border-radius: var(--radius-sm);
    border: none;
    background: transparent;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
  }
  .action-btn:hover { background: rgba(255,255,255,0.08); color: var(--foam); }
  .action-btn.primary:hover { background: rgba(120, 221, 232, 0.15); color: var(--bridge-glow); }
  .action-btn.danger:hover { background: rgba(255, 101, 74, 0.15); color: var(--alert-red); }

  .loading-state, .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: var(--text-dim);
  }
  .empty-icon { font-size: 36px; margin-bottom: 12px; }
  .empty-sub { font-size: 12px; color: var(--text-faint); margin-top: 4px; }

  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner {
    width: 20px; height: 20px;
    border: 2px solid var(--bridge-border);
    border-top-color: var(--bridge-glow);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 10px;
  }
</style>
```

---

## 5. SEARCH ARCHITECTURE

### 5.1 Search Modes

| Mode | When | Performance | Implementation |
|------|------|-------------|----------------|
| **Header scan** | List view always | < 5ms per file | Read first 10 lines + stat |
| **Full-text grep** | User types in search box | 50-500ms (all files) | Parallel file scan, regex match on content |
| **Structured filter** | Click filter buttons | Instant (already in memory) | Client-side filter on loaded summaries |

### 5.2 Full-Text Search Implementation

```rust
/// Full-text search across ALL session files.
/// Expensive operation — debounce on frontend, show progress.
pub fn search_sessions(
    session_dir: &Path,
    query: &str,                       // Free-text search string
    limit: usize,
) -> Result<Vec<SessionSummary>, BridgeError> {
    let regex = Regex::new(query).map_err(|e| BridgeError::ConfigError(e.to_string()))?;

    // Use rayon for parallel file scanning if session count > 20
    let results: Vec<_> = if cfg!(feature = "parallel-search") {
        // Parallel version using rayon
        collect_session_files(session_dir)?
            .par_iter()
            .filter_map(|path| search_single_file(path, &regex).ok())
            .flatten()
            .take(limit)
            .collect()
    } else {
        // Sequential fallback
        collect_session_files(session_dir)?
            .iter()
            .filter_map(|path| search_single_file(path, &regex).ok())
            .flatten()
            .take(limit)
            .collect()
    };

    Ok(results)
}

fn search_single_file(path: &Path, regex: &Regex) -> Result<Vec<SessionSummary>, BridgeError> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let mut matches = Vec::new();
    let mut matched_lines: u32 = 0;

    for (line_num, line_result) in reader.lines().enumerate() {
        let line = line_result?;
        if regex.is_match(&line) {
            matched_lines += 1;
            // On first match, build minimal summary
            if matches.is_empty() {
                if let Some(summary) = scan_session_file(path, "", None)? {
                    matches.push(summary);
                }
            }
        }
    }

    // Annotate match count
    if let Some(ref mut s) = matches.first_mut() {
        // Store match info somewhere useful
    }

    if matched_lines > 0 { Ok(matches) } else { Ok(Vec::new()) }
}
```

### 5.3 Frontend Search Debounce

```typescript
// lib/stores/history-store.ts
import { derived } from 'svelte/store';
import { debounce } from '$lib/utils';

const searchText = writable('');
const filterVessel = writable<string | null>(null);
const filterErrorOnly = writable(false);
const filterDateRange = writable<'today' | 'week' | 'month' | 'all'>('all');

const filteredSessions = derived(
  [allSessions, searchText, filterVessel, filterErrorOnly, filterDateRange],
  ([$all, $query, $vessel, $errors, $date]) => {
    let result = [...$all];

    // Text search (client-side on preview text + model + cwd)
    if ($query) {
      const q = $query.toLowerCase();
      result = result.filter(s =>
        s.preview_text?.toLowerCase().includes(q) ||
        s.model?.toLowerCase().includes(q) ||
        s.cwd.toLowerCase().includes(q) ||
        s.provider?.toLowerCase().includes(q)
      );
    }

    // Vessel filter
    if ($vessel) {
      result = result.filter(s => s.vessel_id === $vessel);
    }

    // Error filter
    if ($errors) {
      result = result.filter(s => s.has_error);
    }

    // Date filter
    if ($date !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if ($date === 'today') cutoff.setHours(0, 0, 0, 0);
      else if ($date === 'week') cutoff.setDate(now.getDate() - 7);
      else if ($date === 'month') cutoff.setMonth(now.getMonth() - 1);
      result = result.filter(s => new Date(s.created_at) >= cutoff);
    }

    return result;
  }
);

// Server-side search (for full-content grep)
const serverSearchResults = writable<SessionSummary[] | null>(null);

const debouncedSearch = debounce(async (query: string) => {
  if (!query || query.length < 2) {
    serverSearchResults.set(null);
    return;
  }
  const results = await invoke<SessionSummary[]>('session_search', { queryString: query });
  serverSearchResults.set(results);
}, 400); // 400ms debounce
```

---

## 6. FORK & RESUME FLOWS

### 6.1 Fork Flow

```
User clicks ↻ on a session
  │
  ├─ Frontend shows fork dialog:
  │   ┌──────────────────────────────────────┐
  │   │ Fork Session                         │
  │   │                                      │
  │   │ From: "Add an about page..."         │
  │   │ Vessel: web-dev-cody                 │
  │   │                                      │
  │   │ New prompt (optional):               │
  │   │ ┌────────────────────────────────┐   │
  │   │ │ Also fix the mobile layout     │   │
  │   │ └────────────────────────────────┘   │
  │   │                                      │
  │   │ Model: [glm-5v-turbo (same) ▼]      │
  │   │                                      │
  │   │        [Cancel]  [🔀 Fork Session]   │
  │   └──────────────────────────────────────┘
  │
  ├─ User confirms → invoke('session_fork', { session_file, vessel_id, prompt })
  │
  ├─ Rust: extracts pi_session_id from filename or reads it from session header
  │   Runs: pi --fork <session-id> -p "Also fix the mobile layout"
  │   With CWD set to vessel path
  │
  ├─ New PiSession created → switch execution view to new session
  │
  └─ Show badge: "Forked from session 019e49f5..."
```

### 6.2 Resume Flow

```
User clicks ▶ (Resume) on a session
  │
  ├─ invoke('session_resume', { session_file })
  │
  ├─ Rust: runs pi --continue (or pi --session <id>)
  │   With CWD set to original vessel path
  │
  ├─ New interactive PTY session spawned
  │
  └─ Switch to Station Log tab with connected terminal
     Show: "Resumed session from May 21, 14:23"
```

---

## 7. RETENTION & MAINTENANCE

### 7.1 Auto-Cleanup Policy (Configurable)

```rust
pub struct RetentionPolicy {
    pub max_age_days: u32,              // Default: 90 days
    pub max_sessions_per_vessel: u32,    // Default: 200
    pub max_total_size_mb: u64,          // Default: 500 MB
    pub auto_cleanup_enabled: bool,      // Default: true
    /// Sessions matching these patterns are never deleted:
    pub keep_patterns: Vec<String>,      // E.g., ["*error*", "*important*"]
}

/// Run cleanup (called on app startup, or manually via Helm)
pub fn cleanup_old_sessions(
    session_dir: &Path,
    policy: &RetentionPolicy,
) -> Result<CleanupReport, BridgeError> {
    // 1. List all sessions with age + size
    // 2. Mark for deletion:
    //    - Older than max_age_days
    //    - Beyond max_sessions_per_vessel (keep newest)
    //    - If total size exceeds max_total_size_mb (delete oldest first)
    // 3. Exclude sessions matching keep_patterns
    // 4. Delete marked files
    // 5. Return report
}
```

### 7.2 Session Stats Dashboard

Available from the history browser header:

```
┌─ Fleet Session Statistics (Last 30 Days) ─────────────┐
│                                                       │
│  Total sessions:    127    ████░░░░░░░ vs last month  │
│  Total tokens:      1.2M  ████████░░░                 │
│  Total cost:        $0.34 █████░░░░░░                 │
│  Avg turns/session: 3.2   ██░░░░░░░░░                 │
│  Error rate:        4.7%  █░░░░░░░░░░░  (↓ from 6%)   │
│                                                       │
│  Top models:                                         │
│  ████████████ glm-5v-turbo    68%  (86 sessions)     │
│  ██████ sonnet:high           22%  (28 sessions)      │
│  ███ gpt-4o                   10%  (13 sessions)      │
│                                                       │
│  Daily activity:                                      │
│  ▁▂▃▅▆▇█▇▆▅▃▂▁▂▃▄▆▇██▇▆▄▃▂ (bar chart, last 30 days)│
│                                                       │
└───────────────────────────────────────────────────────┘
```

---

## 8. PERFORMANCE TARGETS

| Operation | Target | Notes |
|-----------|--------|-------|
| Scan 100 session headers | < 200ms | First 10 lines each, parallelized |
| Open session detail (1MB file) | < 300ms | Full parse + component render |
| Full-text search across 100 sessions | < 2s | Regex match, parallel I/O |
| Fork session launch | < 2s | Pi startup + context loading |
| Virtual scroll through 1000+ sessions | 60fps | `svelte-virtual-list` windowed rendering |
| Delete session | < 50ms | File delete + update list |

---

## SUMMARY

| Layer | What's Defined |
|-------|----------------|
| **Data structures** | `SessionSummary`, `SessionDetail`, `HistoricalTurn`, `SessionQuery`, `RetentionPolicy` |
| **Scanner** | `scan_all_sessions()` — header-only fast scan, CWD→vessel matching |
| **Detail reader** | `read_session_detail()` — full JSONL parse, turn reconstruction, file reference extraction |
| **IPC commands** | 8 commands: list, detail, search, fork, resume, export, delete, stats |
| **UI layouts** | List view (with virtual scroll), detail panel (slide-in), stats dashboard, fork dialog |
| **Components** | `SessionList.svelte` with full code, search/filter bar, actions toolbar |
| **Search** | 3 modes: header scan (instant), structured filter (client-side), full-text grep (server-side, debounced) |
| **Fork/Resume** | Complete flows with dialog specs |
| **Retention** | Auto-cleanup policy engine with configurable rules |
| **Performance** | 6 targets with implementation strategies |

**Ready to implement.** 🔨
