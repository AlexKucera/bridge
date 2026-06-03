/* commands — Tauri command handlers

   Bridges the frontend (JS/TS invocations) to the Rust backend.
   Each command extracts params from Tauri's invoke call,
   accesses the shared DB pool via State, and returns a result. */

use crate::config::{self, BridgeConfig, ConfigError, ValidationReport};
use crate::db::Pool;
use crate::vessel::{self, Vessel, VesselError, VesselWithGit};
use sqlx::Sqlite;
use tauri::{Emitter, Manager, State};


/// Add a new vessel from a filesystem path.
#[tauri::command]
pub async fn vessel_add(
    pool: State<'_, Pool<Sqlite>>,
    path: String,
    display_name: Option<String>,
) -> Result<Vessel, VesselError> {
    vessel::add_vessel(&pool, &path, display_name.as_deref()).await
}

/// List all vessels sorted by name.
#[tauri::command]
pub async fn vessel_list(
    pool: State<'_, Pool<Sqlite>>,
) -> Result<Vec<Vessel>, VesselError> {
    vessel::list_vessels(&pool).await
}

/// Get a single vessel by ID.
#[tauri::command]
pub async fn vessel_get(
    pool: State<'_, Pool<Sqlite>>,
    id: i64,
) -> Result<Vessel, VesselError> {
    vessel::get_vessel(&pool, id).await
}

/// Rename a vessel's display name.
#[tauri::command]
pub async fn vessel_rename(
    pool: State<'_, Pool<Sqlite>>,
    id: i64,
    display_name: String,
) -> Result<Vessel, VesselError> {
    vessel::rename_vessel(&pool, id, &display_name).await
}

/// Remove a vessel and cascade-delete its data.
#[tauri::command]
pub async fn vessel_remove(
    pool: State<'_, Pool<Sqlite>>,
    id: i64,
) -> Result<(), VesselError> {
    vessel::remove_vessel(&pool, id).await
}

/// List all vessels with git metadata (branch, dirty state).
#[tauri::command]
pub async fn vessel_list_with_git(
    pool: State<'_, Pool<Sqlite>>,
) -> Result<Vec<VesselWithGit>, VesselError> {
    vessel::list_vessels_with_git(&pool).await
}

// ── Config Commands ──────────────────────────────────────

/// Load Bridge configuration from disk (or return defaults).
#[tauri::command]
pub async fn config_get() -> Result<BridgeConfig, ConfigError> {
    config::load_config()
}

/// Save Bridge configuration to disk.
#[tauri::command]
pub async fn config_save(config: BridgeConfig) -> Result<(), ConfigError> {
    config::save_config(&config)
}

/// Validate the current Bridge configuration.
#[tauri::command]
pub async fn config_validate(
) -> Result<ValidationReport, ConfigError> {
    let cfg = config::load_config()?;
    Ok(config::validate(&cfg))
}

/// Auto-detect Pi binary by searching PATH and common install locations.
#[tauri::command]
pub async fn config_detect_binary() -> Result<Option<String>, String> {
    Ok(config::detect_pi_binary())
}

// ── Event Processing Commands ───────────────────────

use crate::pi_event::{self, PiJsonEvent};
use crate::pi_state::{self, ExecutionViewModel, StateChange};

/// Parse a single JSONL line into a PiJsonEvent (for debugging/testing).
#[tauri::command]
pub async fn event_parse_line(line: String) -> Result<Option<PiJsonEvent>, String> {
    pi_event::parse_line(&line).map_err(|e| e.to_string())
}

/// Parse a multi-line JSONL string into a Vec of events.
#[tauri::command]
pub async fn event_parse_jsonl(jsonl: String) -> Result<Vec<PiJsonEvent>, String> {
    let mut events = Vec::new();
    for line in jsonl.lines() {
        match pi_event::parse_line(line).map_err(|e| e.to_string())? {
            Some(event) => events.push(event),
            None => {}
        }
    }
    Ok(events)
}

/// Create a fresh ExecutionViewModel (Queued state).
#[tauri::command]
pub async fn state_create_session() -> Result<ExecutionViewModel, String> {
    Ok(ExecutionViewModel::default())
}

/// Apply a JSON-serialized PiJsonEvent to a session model.
/// Returns (updated_model, list_of_state_changes).
#[tauri::command]
pub async fn state_apply_event(
    model: ExecutionViewModel,
    event_json: serde_json::Value,
) -> Result<(ExecutionViewModel, Vec<String>), String> {
    // Deserialize the event from JSON
    let event: PiJsonEvent = serde_json::from_value(event_json)
        .map_err(|e| format!("Invalid event: {}", e))?;

    let mut model = model;
    let changes = pi_state::apply_event(&mut model, &event);

    // Convert StateChange to string descriptions for frontend
    let change_names: Vec<String> = changes
        .into_iter()
        .map(|c| match c {
            StateChange::NewTurn(id) => format!("new_turn({})", id),
            StateChange::TurnUpdated(id) => format!("turn_updated({})", id),
            StateChange::NewToolCall { turn_id, tool_id } => format!("new_tool({}, {})", turn_id, tool_id),
            StateChange::ToolCallUpdated { turn_id, tool_id } => format!("tool_updated({}, {})", turn_id, tool_id),
            StateChange::SessionStatusChanged(s) => format!("status_changed({:?})", s),
            StateChange::MetricsUpdated => "metrics_updated".to_string(),
        })
        .collect();

    Ok((model, change_names))
}


// -- Session Lifecycle Commands --

use crate::pi_session::{self, Session, SessionMode, SessionRegistry};

// ── Pi JSONL → ExecutionUpdateEvent Mapper ───────────────────

/// Extract plain text from a pi message content array.
/// Content blocks: [{ type: "text", text: "..." }, ...]
fn extract_text_content(content: Option<&serde_json::Value>) -> String {
    match content {
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .filter_map(|block| block.get("text").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .collect::<Vec<_>>()
            .join(" "),
        Some(serde_json::Value::String(s)) => s.clone(),
        _ => String::new(),
    }
}

/// Map a pi CLI JSONL event type + payload into an `execution-update` Tauri event
/// that matches the frontend's [`ExecutionUpdateEvent`](crate::store::pi_store) interface.
fn map_pi_event(
    event_type: &str,
    parsed: &serde_json::Value,
    sid_str: &str,
    turn_counter: &mut u32,
    current_role: &mut Option<String>,
) -> Option<serde_json::Value> {
    use serde_json::json;

    match event_type {
        "session" => Some(json!({
            "type": "status_changed", "sessionId": sid_str, "status": "Running",
        })),
        "agent_start" => Some(json!({
            "type": "status_changed", "sessionId": sid_str, "status": "Thinking",
        })),
        "turn_start" => {
            *turn_counter += 1;
            Some(json!({ "type": "new_turn", "sessionId": sid_str, "turnId": *turn_counter }))
        }
        "message_start" => parsed.get("message").and_then(|msg| {
            let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
            *current_role = Some(role.clone());
            if role == "user" {
                let text = extract_text_content(msg.get("content"));
                Some(json!({
                    "type": "new_turn", "sessionId": sid_str, "turnId": *turn_counter,
                    "role": "user", "promptText": text,
                }))
            } else {
                Some(json!({
                    "type": "status_changed", "sessionId": sid_str, "status": "Running",
                }))
            }
        }),
        "text_delta" | "content_block_delta" => {
            let delta = parsed.get("delta").or_else(|| parsed.get("text"))
                .and_then(|v| v.as_str()).unwrap_or("");
            if delta.is_empty() { return None; }
            match current_role.as_deref() {
                Some("assistant") | Some("model") => Some(json!({
                    "type": "textDelta", "sessionId": sid_str, "turnId": *turn_counter as i64, "textDelta": delta,
                })),
                _ => None,
            }
        }
        "thinking_delta" => {
            let delta = parsed.get("delta").or_else(|| parsed.get("text"))
                .and_then(|v| v.as_str()).unwrap_or("");
            if delta.is_empty() { return None; }
            Some(json!({
                "type": "thinkingDelta", "sessionId": sid_str, "turnId": *turn_counter as i64, "thinkingDelta": delta,
            }))
        }
        "tool_use_start" | "tool_call_start" => {
            let name = parsed.get("name").or_else(|| parsed.get("tool_name"))
                .and_then(|v| v.as_str()).unwrap_or("unknown");
            let id = parsed.get("id").or_else(|| parsed.get("tool_call_id"))
                .and_then(|v| v.as_str())
                .unwrap_or(&format!("tc-{}", turn_counter)).to_string();
            Some(json!({
                "type": "new_tool_call", "sessionId": sid_str, "turnId": *turn_counter,
                "toolId": id, "toolName": name, "status": "Running",
            }))
        }
        "tool_use_end" | "tool_call_end" | "tool_result" => {
            parsed.get("id").or_else(|| parsed.get("tool_call_id"))
                .and_then(|v| v.as_str()).map(|tid| json!({
                    "type": "tool_call_updated", "sessionId": sid_str, "turnId": *turn_counter,
                    "toolId": tid, "status": "Completed",
                }))
        }
        "message_end" | "turn_end" => Some(json!({
            "type": "turn_updated", "sessionId": sid_str, "turnId": *turn_counter,
        })),
        "session_end" | "done" => Some(json!({
            "type": "status_changed", "sessionId": sid_str, "status": "Done",
        })),
        _ => Some(json!({ // Unknown — pass through for debugging
            "type": "unknown_event", "sessionId": sid_str, "raw": parsed,
        })),
    }
}

/// Launch a new Pi session.
///
/// For PTY-mode sessions, also starts the output event loop that bridges
/// PTY stdout → mpsc → Tauri `app.emit_all("pty-output")` events.
#[tauri::command]
pub async fn session_launch(
    app: tauri::AppHandle,
    pool: State<'_, Pool<Sqlite>>,
    registry: State<'_, SessionRegistry>,
    vessel_id: Option<i64>,
    mode: String,
    prompt: String,
    overrides_json: String,
) -> Result<Session, String> {
    let session_mode = SessionMode::from_str(&mode).unwrap_or(SessionMode::Json);
    let overrides: config::LaunchOverrides = serde_json::from_str(&overrides_json)
        .map_err(|e| format!("Invalid overrides: {}", e))?;
    let global = config::load_config().map_err(|e| e.to_string())?;
    let mut running = pi_session::launch(
        &pool, &registry, vessel_id, &session_mode, &prompt, &overrides,
        global.max_concurrency,
    ).await.map_err(|e| e.to_string())?;
    let sid = running.session_id;

    // For PTY sessions, start the output event loop
    if session_mode == SessionMode::Pty {
        if let Some(pty_session) = running.take_pty() {
            use crate::pi_session::pty_output::{PtyOutputEvent, PtyOutputLoop};
            let (tx, rx) = std::sync::mpsc::channel::<PtyOutputEvent>();
            let _loop_handle = PtyOutputLoop::start(sid, pty_session, tx);

            // Spawn background task: PtyOutputEvents → Tauri events
            let app_clone = app.clone();
            tokio::spawn(async move {
                while let Ok(event) = rx.recv() {
                    match event {
                        PtyOutputEvent::Output(payload) => {
                            if let Ok(json) = serde_json::to_value(&payload) {
                                let _ = app_clone.emit("pty-output", json);
                            }
                        }
                        PtyOutputEvent::Exit(exit_payload) => {
                            if let Ok(json) = serde_json::to_value(&exit_payload) {
                                let _ = app_clone.emit("pty-exit", json);
                            }
                        }
                    }
                }
            });
        }
    } else if session_mode == SessionMode::Json {
        // For JSON-mode sessions, read child stdout and translate pi JSONL → execution-update events
        if let Some(mut child) = running.take_child() {
            let sid_str = sid.to_string();
            let app_clone = app.clone();
            let pool_clone = pool.inner().clone();
            let sid_for_finalize = sid;
            tokio::spawn(async move {
                use tokio::io::{AsyncBufReadExt, BufReader};
                if let Some(stdout) = child.stdout.take() {
                    let reader = BufReader::new(stdout);
                    let mut lines = reader.lines();
                    let mut turn_counter: u32 = 0;
                    let mut current_role: Option<String> = None;

                    while let Ok(Some(line)) = lines.next_line().await {
                        let trimmed = line.trim();
                        if trimmed.is_empty() { continue; }

                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                            let event_type = parsed.get("type")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");

                            let mapped = map_pi_event(&event_type, &parsed, &sid_str, &mut turn_counter, &mut current_role);

                            if let Some(event) = mapped {
                                let _ = app_clone.emit("execution-update", event);
                            }
                        }
                    }

                    // Child exited — finalize session
                    let exit_code = child.wait().await.ok().and_then(|s| s.code());

                    let outcome = pi_session::ExitOutcome::from_exit_code(exit_code);
                    if let Ok(result) = pi_session::finalize_session(
                        &pool_clone, sid_for_finalize, &outcome, 0, 0.0, &None,
                    ).await {
                        let _ = app_clone.emit(
                            "session-complete",
                            serde_json::to_value(&result).unwrap_or(serde_json::json!({})),
                        );
                    }

                    // Emit Done/Error status for backward compat
                    let status = if outcome.is_failure() { "Error" } else { "Done" };
                    let done = serde_json::json!({ "type": "status_changed", "sessionId": sid_str, "status": status });
                }
            });
        }
    }
    registry.insert(sid, running).await;
    pi_session::get_session(&pool, sid).await.map_err(|e| e.to_string())
}
/// Stop a running Pi session (SIGTERM -> grace period -> SIGKILL).
#[tauri::command]
pub async fn session_stop(
    pool: State<'_, Pool<Sqlite>>,
    registry: State<'_, SessionRegistry>,
    session_id: i64,
) -> Result<Session, String> {
    pi_session::stop(&pool, &registry, session_id, 5000).await
        .map_err(|e| e.to_string())
}

/// Retry a previous session (clone config + relaunch).
#[tauri::command]
pub async fn session_retry(
    pool: State<'_, Pool<Sqlite>>,
    registry: State<'_, SessionRegistry>,
    session_id: i64,
) -> Result<Session, String> {
    let running = pi_session::retry(&pool, &registry, session_id).await
        .map_err(|e| e.to_string())?;
    let sid = running.session_id;
    registry.insert(sid, running).await;
    pi_session::get_session(&pool, sid).await.map_err(|e| e.to_string())
}

/// List all sessions.
#[tauri::command]
pub async fn session_list(
    pool: State<'_, Pool<Sqlite>>,
) -> Result<Vec<Session>, String> {
    sqlx::query_as::<_, Session>(
        "SELECT id, vessel_id, mode, status, prompt, model, provider, started_at, completed_at, tokens_used, total_cost, error_message FROM sessions ORDER BY started_at DESC"
    ).fetch_all(&*pool).await.map_err(|e| e.to_string())
}

/// Get a single session by ID.
#[tauri::command]
pub async fn session_get(
    pool: State<'_, Pool<Sqlite>>,
    session_id: i64,
) -> Result<Session, String> {
    pi_session::get_session(&pool, session_id).await.map_err(|e| e.to_string())
}

/// Finalize a session: capture exit outcome, compute metrics, update DB.
///
/// Call this when a Pi session ends (clean exit, crash, or user stop).
/// Returns finalization data for UI display and event emission.
#[tauri::command]
pub async fn session_finalize(
    pool: State<'_, Pool<Sqlite>>,
    session_id: i64,
    exit_code: Option<i32>,
    tokens_used: i64,
    total_cost: f64,
) -> Result<pi_session::SessionFinalizeResult, String> {
    // Fetch started_at for duration computation
    let session = pi_session::get_session(&pool, session_id)
        .await.map_err(|e| e.to_string())?;
    
    let outcome = pi_session::ExitOutcome::from_exit_code(exit_code);
    pi_session::finalize_session(
        &pool, session_id, &outcome, tokens_used, total_cost, &session.started_at,
    ).await.map_err(|e| e.to_string())
}

// -- PTY I/O Commands --

/// Write data to a PTY session's stdin (sends keystrokes to Pi).
#[tauri::command]
pub async fn pty_write(
    registry: State<'_, SessionRegistry>,
    session_id: i64,
    data: String,
) -> Result<(), String> {
    registry.pty_write(session_id, data.as_bytes()).await.map_err(|e| e.to_string())
}

/// Resize a PTY session's terminal window.
#[tauri::command]
pub async fn pty_resize(
    registry: State<'_, SessionRegistry>,
    session_id: i64,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    registry.pty_resize(session_id, cols, rows).await.map_err(|e| e.to_string())
}

// -- Cargo (Git) Commands --

use crate::cargo::{self, SessionContext};

/// Get git status for a vessel's repository.
#[tauri::command]
pub async fn cargo_status(vessel_path: String) -> std::result::Result<cargo::StatusResult, String> {
    match cargo::cargo_status(std::path::Path::new(&vessel_path)) {
        Ok(r) => Ok(r),
        Err(e) => Err(e.to_string()),
    }
}

/// Get git diff for a vessel's repository.
#[tauri::command]
pub async fn cargo_diff(vessel_path: String) -> std::result::Result<cargo::DiffResult, String> {
    match cargo::cargo_diff(std::path::Path::new(&vessel_path)) {
        Ok(r) => Ok(r),
        Err(e) => Err(e.to_string()),
    }
}

/// Stage all changes and commit with the given message.
#[tauri::command]
pub async fn cargo_commit(vessel_path: String, message: String) -> std::result::Result<cargo::CommitResult, String> {
    match cargo::cargo_commit(std::path::Path::new(&vessel_path), &message) {
        Ok(r) => Ok(r),
        Err(e) => Err(e.to_string()),
    }
}

/// Push commits to remote.
#[tauri::command]
pub async fn cargo_push(vessel_path: String) -> std::result::Result<cargo::PushResult, String> {
    match cargo::cargo_push(std::path::Path::new(&vessel_path)) {
        Ok(r) => Ok(r),
        Err(e) => Err(e.to_string()),
    }
}

/// Generate a conventional commit message from session context.
#[tauri::command]
pub async fn cargo_generate_message(context: SessionContext) -> std::result::Result<String, String> {
    Ok(cargo::generate_commit_message(&context))
}
