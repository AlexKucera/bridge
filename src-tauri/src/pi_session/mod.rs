//! Session lifecycle management for Pi AI coding agent sessions.
//! Owns: CRUD, pre-flight validation, process spawning,
//! stdout pipeline routing, graceful shutdown, retry, concurrency limiting.

#![allow(dead_code)]

pub mod pty;
pub mod pty_output;

#[cfg(test)]
mod pty_output_tests;
mod pty_integration_tests;

use serde::{Deserialize, Serialize};
use sqlx::Sqlite;
use crate::config;
pub use sqlx::Pool;

// -- Session Mode --

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionMode {
    Json,
    Pty,
}

impl SessionMode {
    pub fn as_str(&self) -> &'static str {
        match self { SessionMode::Json => "json", SessionMode::Pty => "pty" }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s { "json" => Some(SessionMode::Json), "pty" => Some(SessionMode::Pty), _ => None }
    }
}

// -- Session Record --

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: i64,
    pub vessel_id: Option<i64>,
    pub mode: Option<String>,
    pub status: String,
    pub prompt: Option<String>,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub tokens_used: i64,
    pub total_cost: f64,
    pub error_message: Option<String>,
}

// -- Errors --

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    #[error("Database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("Session not found: {0}")]
    NotFound(i64),
    #[error("At capacity: {current} active sessions (max: {max})")]
    AtCapacity { current: usize, max: u32 },
    #[error("Session error: {0}")]
    Other(String),
    #[error("Session not running: {0}")]
    NotRunning(i64),
}

// -- Pre-flight Types --

#[derive(Debug, Clone, PartialEq)]
pub struct PreflightOk {
    pub binary_path: String,
}

#[derive(Debug, thiserror::Error)]
pub enum PreflightError {
    #[error("Binary path is empty")]
    BinaryEmpty,
    #[error("Binary not found: {0}")]
    BinaryNotFound(String),
    #[error("Binary is not executable: {0}")]
    BinaryNotExecutable(String),
}

// -- Session CRUD --

/// Create a new session record in the database.
pub async fn create_session_record(
    pool: &Pool<Sqlite>,
    vessel_id: Option<i64>,
    mode: &SessionMode,
    prompt: &str,
    model: &str,
    provider: &str,
) -> Result<Session, SessionError> {
    let id = sqlx::query_scalar(
        "INSERT INTO sessions (vessel_id, mode, status, prompt, model, provider) VALUES (?1, ?2, 'Starting', ?3, ?4, ?5) RETURNING id",
    )
    .bind(vessel_id)
    .bind(mode.as_str())
    .bind(prompt)
    .bind(model)
    .bind(provider)
    .fetch_one(pool)
    .await?;
    get_session(pool, id).await
}

/// Update session status string.
pub async fn update_session_status(
    pool: &Pool<Sqlite>,
    session_id: i64,
    status: &str,
) -> Result<(), SessionError> {
    sqlx::query("UPDATE sessions SET status = ?1 WHERE id = ?2")
        .bind(status)
        .bind(session_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Mark session as completed with token/cost totals.
pub async fn update_session_completion(
    pool: &Pool<Sqlite>,
    session_id: i64,
    tokens_used: i64,
    total_cost: f64,
) -> Result<(), SessionError> {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query("UPDATE sessions SET status = 'Completed', completed_at = ?1, tokens_used = ?2, total_cost = ?3 WHERE id = ?4")
        .bind(&now)
        .bind(tokens_used)
        .bind(total_cost)
        .bind(session_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Fetch a single session by ID.
pub async fn get_session(pool: &Pool<Sqlite>, session_id: i64) -> Result<Session, SessionError> {
    sqlx::query_as::<_, Session>(
        "SELECT id, vessel_id, mode, status, prompt, model, provider, started_at, completed_at, tokens_used, total_cost, error_message FROM sessions WHERE id = ?1",
    )
    .bind(session_id)
    .fetch_optional(pool)
    .await?
    .ok_or(SessionError::NotFound(session_id))
}

/// List all non-terminal sessions.
pub async fn list_active_sessions(pool: &Pool<Sqlite>) -> Result<Vec<Session>, SessionError> {
    sqlx::query_as::<_, Session>(
        "SELECT id, vessel_id, mode, status, prompt, model, provider, started_at, completed_at, tokens_used, total_cost, error_message FROM sessions WHERE status NOT IN ('Completed', 'Stopped', 'Error')",
    )
    .fetch_all(pool)
    .await
    .map_err(From::from)
}

// -- Pre-flight Validation --

/// Check that the configured Pi binary exists and is executable.
pub fn preflight_check(cfg: &config::BridgeConfig) -> Result<PreflightOk, PreflightError> {
    let path = cfg.pi_binary_path.as_str();
    if path.is_empty() {
        return Err(PreflightError::BinaryEmpty);
    }
    let p = std::path::Path::new(path);
    if !p.exists() {
        return Err(PreflightError::BinaryNotFound(path.to_string()));
    }
    use std::os::unix::fs::PermissionsExt;
    if !p.metadata()
        .map(|m| m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
    {
        return Err(PreflightError::BinaryNotExecutable(path.to_string()));
    }
    Ok(PreflightOk { binary_path: path.to_string() })
}

// -- Command Building --

/// Build the argv vector for launching a Pi subprocess.
pub fn build_launch_command(
    cfg: &config::BridgeConfig,
    overrides: &config::LaunchOverrides,
    session_dir: &str,
    mode: &SessionMode,
    prompt: &str,
) -> Vec<String> {
    let mut cmd = vec![];
    if mode == &SessionMode::Json {
        cmd.push("chat".into());
    }
    cmd.push("--output-format".into());
    cmd.push("json".into());
    if !session_dir.is_empty() {
        cmd.push("--session-dir".into());
        cmd.push(session_dir.into());
    }
    if let Some(ref m) = overrides.model {
        cmd.push("--model".into());
        cmd.push(m.clone());
    } else if !cfg.default_model.is_empty() {
        cmd.push("--model".into());
        cmd.push(cfg.default_model.clone());
    }
    if !cfg.default_provider.is_empty() {
        cmd.push("--provider".into());
        cmd.push(cfg.default_provider.clone());
    }
    cmd.push(prompt.to_string());
    cmd
}

// -- Session Meta --

/// Lightweight metadata for a running session (stored in registry).
#[derive(Debug)]
pub struct SessionMeta {
    pub session_id: i64,
    pub vessel_id: Option<i64>,
    pub mode: SessionMode,
    pub started_at: std::time::Instant,
    pub pid: Option<u32>,
}

// -- Session Registry --

/// Thread-safe map of session_id → RunningSession.
pub struct SessionRegistry {
    inner: std::sync::Arc<tokio::sync::RwLock<std::collections::HashMap<i64, RunningSession>>>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self {
            inner: std::sync::Arc::new(tokio::sync::RwLock::new(std::collections::HashMap::new())),
        }
    }

    pub async fn insert(&self, id: i64, session: RunningSession) {
        self.inner.write().await.insert(id, session);
    }

    pub async fn get(&self, id: i64) -> bool {
        self.inner.read().await.contains_key(&id)
    }

    /// Remove and return a session (for stop/teardown).
    pub async fn take(&self, id: i64) -> Option<RunningSession> {
        self.inner.write().await.remove(&id)
    }

    /// Remove a session by ID, returning it if it existed.
    pub async fn remove(&self, id: i64) -> Option<RunningSession> {
        self.inner.write().await.remove(&id)
    }

    /// Count the number of active (running) sessions.
    pub async fn count_active(&self) -> usize {
        self.inner.read().await.len()
    }

    /// Write data to a PTY session's stdin. Returns error if not found or not a PTY.
    pub async fn pty_write(&self, session_id: i64, data: &[u8]) -> Result<(), SessionError> {
        let guard = self.inner.read().await;
        let running = guard.get(&session_id)
            .ok_or(SessionError::NotRunning(session_id))?;
        match &running.process {
            SessionProcess::Pty(pty) => { pty.write(data).map_err(|e| SessionError::Other(e.to_string()))?; Ok(()) }
            SessionProcess::Child(_) => Err(SessionError::Other("Cannot write to non-PTY session".to_string())),
            SessionProcess::Taken => Err(SessionError::Other("PTY session was taken".to_string())),
        }
    }
    /// Resize a PTY session's terminal. Returns error if not found or not a PTY.
    pub async fn pty_resize(&self, session_id: i64, cols: u16, rows: u16) -> Result<(), SessionError> {
        let guard = self.inner.read().await;
        let running = guard.get(&session_id)
            .ok_or(SessionError::NotRunning(session_id))?;
        match &running.process {
            SessionProcess::Pty(pty) => pty.resize(cols, rows).map_err(|e| SessionError::Other(e.to_string())),
            SessionProcess::Child(_) => Err(SessionError::Other("Cannot resize non-PTY session".to_string())),
            SessionProcess::Taken => Err(SessionError::Other("PTY session was taken".to_string())),
        }
}}

impl Default for SessionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// -- Running Session --

/// Enum holding either a regular stdio Child or a PTY session.
pub enum SessionProcess {
    /// Regular tokio child process with piped stdio (JSON mode).
    Child(tokio::process::Child),
    /// PTY session with master handle (interactive terminal mode).
    Pty(crate::pi_session::pty::PtySession),
    /// Sentinel: PTY was taken by take_pty(). Accessing this is a bug.
    Taken,
}

/// Handle to an active session process plus its metadata.
pub struct RunningSession {
    pub session_id: i64,
    pub meta: SessionMeta,
    pub process: SessionProcess,
}

impl RunningSession {
    /// Returns true if this session is running in PTY mode.
    pub fn is_pty(&self) -> bool {
        matches!(self.process, SessionProcess::Pty(_))
    }

    /// Returns true if this session is running as a regular child process.
    pub fn is_child(&self) -> bool {
        matches!(self.process, SessionProcess::Child(_))
    }

    /// Take ownership of the PtySession, leaving the process field in an invalid state.
    /// Only call this once — after taking, is_pty() will return false.
    pub fn take_pty(&mut self) -> Option<crate::pi_session::pty::PtySession> {
        if let SessionProcess::Pty(pty) = std::mem::replace(&mut self.process, SessionProcess::Taken) {
            Some(pty)
        } else {
            None
        }
    }
}
// -- Launch --

/// Spawn a new Pi session: validate, check capacity, build command, insert DB record, fork process.
pub async fn launch(
    pool: &Pool<Sqlite>,
    registry: &SessionRegistry,
    vessel_id: Option<i64>,
    mode: &SessionMode,
    prompt: &str,
    overrides: &config::LaunchOverrides,
    max_concurrency: u32,
) -> Result<RunningSession, SessionError> {
    let global = config::load_config().map_err(|e| SessionError::Other(e.to_string()))?;

    // Pre-flight binary check
    preflight_check(&global).map_err(|e| SessionError::Other(e.to_string()))?;

    // Concurrency guard
    let active = registry.count_active().await;
    if active >= max_concurrency as usize {
        return Err(SessionError::AtCapacity { current: active, max: max_concurrency });
    }

    // Resolve config (global + vessel-level + overrides)
    let _resolved = config::resolve_config(&global, None, overrides);

    // Session working directory
    let base = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("/tmp"))
        .join("bridge")
        .join("sessions");
    let session_dir = format!(
        "{}/{:x}",
        base.display(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
    );

    // Resolve binary
    let binary = if global.pi_binary_path.is_empty() {
        "pi".to_string()
    } else {
        global.pi_binary_path.clone()
    };
    let args = build_launch_command(&global, overrides, &session_dir, mode, prompt);

    // Create DB record
    let model = global.default_model.clone();
    let provider = global.default_provider.clone();
    let session =
        create_session_record(pool, vessel_id, mode, prompt, &model, &provider).await?;

    // Spawn process (PTY or regular stdio depending on mode)
    let (process, pid) = match mode {
        SessionMode::Pty => {
            let pty = crate::pi_session::pty::PtySession::spawn(
                &binary, &args, None,
            ).map_err(|e| SessionError::Other(format!("PTY spawn failed: {}", e)))?;
            (SessionProcess::Pty(pty), None)
        }
        SessionMode::Json => {
            let child = tokio::process::Command::new(&binary)
                .args(&args)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| SessionError::Other(format!("Failed to spawn {}: {}", binary, e)))?;
            let pid = child.id();
            (SessionProcess::Child(child), pid)
        }
    };

    // Update status to Idle (waiting for first event)
    update_session_status(pool, session.id, "Idle").await?;

    Ok(RunningSession {
        session_id: session.id,
        meta: SessionMeta {
            session_id: session.id,
            vessel_id,
            mode: mode.clone(),
            started_at: std::time::Instant::now(),
            pid,
        },
        process,
    })
}

// -- Stdout Pipeline --

/// Read stdout line-by-line, parse Pi JSONL events, apply to state, emit to frontend.
pub async fn read_stdout_loop(
    _session_id: i64,
    child: &mut tokio::process::Child,
    pool: &Pool<Sqlite>,
    emitter: &mut crate::events::EventEmitter,
) -> Result<(), SessionError> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| SessionError::Other("Cannot capture stdout".into()))?;
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();

    while let Ok(Some(line)) = lines.next_line().await {
        match crate::pi_event::parse_line(&line) {
            Ok(Some(event)) => {
                // Apply event to state
                let _state_changes = crate::pi_state::apply_event(
                    &mut crate::pi_state::ExecutionViewModel::default(),
                    &event,
                );
                // Emit to frontend
                let payload = serde_json::to_value(&event).unwrap_or_default();
                let _ = emitter.emit("execution-update", payload);

                // Auto-complete on AgentEnd
                if matches!(event, crate::pi_event::PiJsonEvent::AgentEnd { .. }) {
                    update_session_completion(pool, _session_id, 0, 0.0).await?;
                }
            }
            Ok(None) => {}
            Err(e) => {
                eprintln!("[session-{}] parse warning: {}", _session_id, e);
            }
        }
    }
    Ok(())
}

// -- Stop (Graceful Shutdown) --

/// Gracefully stop a session: SIGTERM/kill, wait grace period, then force kill.
pub async fn stop(
    pool: &Pool<Sqlite>,
    registry: &SessionRegistry,
    session_id: i64,
    grace_period_ms: u64,
) -> Result<Session, SessionError> {
    let mut running = registry
        .take(session_id)
        .await
        .ok_or(SessionError::NotFound(session_id))?;

    update_session_status(pool, session_id, "Stopping").await?;

    // Terminate based on process type
    match &mut running.process {
        SessionProcess::Child(child) => {
            // Send SIGTERM via kill command for graceful shutdown
            if let Some(pid) = child.id() {
                let _ = std::process::Command::new("kill")
                    .arg("-TERM")
                    .arg(pid.to_string())
                    .output();
            }
            // Wait with grace period
            use tokio::time::{timeout, Duration};
            let grace = Duration::from_millis(grace_period_ms);
            match timeout(grace, child.wait()).await {
                Ok(_) => {}
                Err(_) => {
                    // Force kill after grace period
                    let _ = child.kill().await;
                    let _ = child.wait().await;
                }
            }
        }
        SessionProcess::Pty(pty) => {
            // PTY sessions use portable-pty's kill()
            let _ = pty.kill();
        }
        SessionProcess::Taken => {
            // Already taken — nothing to terminate
        }
    };

    update_session_status(pool, session_id, "Stopped").await?;
    get_session(pool, session_id).await
}

// -- Retry --

/// Relaunch a previous session with the same config.
pub async fn retry(
    pool: &Pool<Sqlite>,
    registry: &SessionRegistry,
    session_id: i64,
) -> Result<RunningSession, SessionError> {
    let original = get_session(pool, session_id).await?;
    let mode = original.mode.as_deref().unwrap_or("json");
    let session_mode = SessionMode::from_str(mode).unwrap_or(SessionMode::Json);
    let prompt = original.prompt.as_deref().unwrap_or("");
    let overrides = config::LaunchOverrides::default();
    let global = config::load_config().map_err(|e| SessionError::Other(e.to_string()))?;
    launch(
        pool,
        registry,
        original.vessel_id,
        &session_mode,
        prompt,
        &overrides,
        global.max_concurrency,
    )
    .await
}

// -- Tests --

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_mode_roundtrip() {
        assert_eq!(SessionMode::Json.as_str(), "json");
        assert_eq!(SessionMode::from_str("json"), Some(SessionMode::Json));
        assert_eq!(SessionMode::from_str("pty"), Some(SessionMode::Pty));
        assert_eq!(SessionMode::from_str("invalid"), None);
    }

    #[test]
    fn test_build_launch_command_json_mode() {
        let cfg = config::BridgeConfig::default();
        let overrides = config::LaunchOverrides::default();
        let cmd = build_launch_command(&cfg, &overrides, "/tmp/test-session", &SessionMode::Json, "hello");
        assert!(cmd.contains(&"chat".into()));
        assert!(cmd.contains(&"--output-format".into()));
        assert!(cmd.contains(&"json".into()));
        assert!(cmd.contains(&"hello".into()));
    }

    #[test]
    fn test_build_launch_command_pty_mode() {
        let cfg = config::BridgeConfig::default();
        let overrides = config::LaunchOverrides::default();
        let cmd = build_launch_command(&cfg, &overrides, "", &SessionMode::Pty, "test");
        assert!(!cmd.contains(&"chat".into()));
        assert!(cmd.contains(&"test".into()));
    }

    #[test]
    fn test_session_registry_lifecycle() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let reg = SessionRegistry::new();
            assert_eq!(reg.count_active().await, 0);
            assert!(!reg.get(999).await);
            reg.remove(999).await;
        });
    }

    #[test]
    fn test_preflight_check_missing_binary() {
        let cfg = config::BridgeConfig {
            pi_binary_path: "/nonexistent/binary/path".to_string(),
            ..Default::default()
        };
        assert!(preflight_check(&cfg).is_err());
    }

    #[test]
    fn test_preflight_check_empty_path() {
        assert!(matches!(
            preflight_check(&config::BridgeConfig {
                pi_binary_path: String::new(),
                ..Default::default()
            }),
            Err(PreflightError::BinaryEmpty)
        ));
    }

    #[test]
    fn test_preflight_check_existing_binary() {
        let result = preflight_check(&config::BridgeConfig {
            pi_binary_path: "/bin/ls".to_string(),
            ..Default::default()
        });
        assert!(result.is_ok());
    }

    #[test]
    fn test_session_error_display() {
        assert_eq!(
            SessionError::NotFound(42).to_string(),
            "Session not found: 42"
        );
        assert!(SessionError::AtCapacity { current: 5, max: 3 }
            .to_string()
            .contains("At capacity"));
    }

    #[test]
    fn test_build_launch_command_with_model_override() {
        let cfg = config::BridgeConfig::default();
        let overrides = config::LaunchOverrides {
            model: Some("gpt-4o".to_string()),
            ..Default::default()
        };
        let cmd = build_launch_command(&cfg, &overrides, "/tmp/s", &SessionMode::Json, "hi");
        let idx = cmd.iter().position(|a| a == "--model").unwrap();
        assert_eq!(cmd[idx + 1], "gpt-4o");
    }

    #[test]
    fn test_running_session_pty_variant() {
        use crate::pi_session::pty::PtySession;

        // Spawn a real PTY session (using /usr/bin/true as test binary)
        let pty = PtySession::spawn("/usr/bin/true", &[], None).unwrap();

        // Build a RunningSession with the PTY variant
        let session = RunningSession {
            session_id: 1,
            meta: SessionMeta {
                session_id: 1,
                vessel_id: None,
                mode: SessionMode::Pty,
                started_at: std::time::Instant::now(),
                pid: None,
            },
            process: SessionProcess::Pty(pty),
        };

        assert_eq!(session.session_id, 1);
        assert!(session.is_pty());
        assert!(!session.is_child());
    }

    #[tokio::test]
    async fn test_running_session_child_variant() {
        use std::process::Stdio;

        // Spawn a regular child process
        let child = tokio::process::Command::new("/usr/bin/true")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("failed to spawn /usr/bin/true");

        let session = RunningSession {
            session_id: 2,
            meta: SessionMeta {
                session_id: 2,
                vessel_id: None,
                mode: SessionMode::Json,
                started_at: std::time::Instant::now(),
                pid: child.id(),
            },
            process: SessionProcess::Child(child),
        };

        assert_eq!(session.session_id, 2);
        assert!(!session.is_pty());
        assert!(session.is_child());
    }
}
