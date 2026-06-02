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
