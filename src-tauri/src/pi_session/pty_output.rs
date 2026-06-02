//! PTY output event loop — bridges PTY reader → channel → Tauri events.
//!
//! When a PTY session is launched, the output loop:
//! 1. Clones a reader handle from the `PtySession`
//! 2. Spawns a blocking thread via `spawn_output_reader` that reads PTY stdout
//! 3. Forwards each chunk as a `PtyOutputEvent` (Output or Exit) through an mpsc channel
//!
//! The consumer (typically Tauri's command layer) receives these events and
//! emits them to the frontend via `app.emit_all("pty-output", payload)`.

use base64::Engine;
use serde::{Serialize, Deserialize};
use crate::pi_session::pty::{self, PtySession};
use std::sync::mpsc;

// ─── Event Types ────────────────────────────────────────────────

/// Payload emitted for each chunk of PTY output data.
///
/// Serialized to JSON and sent to frontend as `"pty-output"` event.
/// The `data` field is base64-encoded raw bytes from the PTY stdout.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutputPayload {
    pub session_id: i64,
    pub data: String, // base64-encoded bytes
    pub timestamp: String,
}

/// Payload emitted when the PTY process exits.
///
/// Sent to frontend as `"pty-exit"` event.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyExitPayload {
    pub session_id: i64,
    pub code: i32,
    pub timestamp: String,
}

/// Events produced by the PTY output loop, sent through mpsc to the consumer.
#[derive(Debug, Clone)]
pub enum PtyOutputEvent {
    /// A chunk of terminal output data (base64-encoded).
    Output(PtyOutputPayload),
    /// The PTY process has exited.
    Exit(PtyExitPayload),
}

// ─── Payload Builders ───────────────────────────────────────────

/// Build a base64-encoded output payload for a PTY data chunk.
pub fn build_output_payload(session_id: i64, data: &[u8]) -> PtyOutputPayload {
    PtyOutputPayload {
        session_id,
        data: base64::engine::general_purpose::STANDARD.encode(data),
        timestamp: chrono::Utc::now().to_rfc3339(),
    }
}

/// Build an exit notification payload.
pub fn build_exit_payload(session_id: i64, code: i32) -> PtyExitPayload {
    PtyExitPayload {
        session_id,
        code,
        timestamp: chrono::Utc::now().to_rfc3339(),
    }
}

// ─── Output Loop ────────────────────────────────────────────────

/// Handle to a running PTY output loop.
///
/// Owns the background join handle. Call `.join()` to block until
/// the loop finishes (reader EOF / error), or drop to detach.
pub struct PtyOutputLoop {
    handle: Option<std::thread::JoinHandle<()>>,
}

impl PtyOutputLoop {
    /// Start the output loop for a PTY session.
    ///
    /// Clones a reader from the session, spawns a blocking read thread,
    /// and forwards each chunk (and eventual exit) as `PtyOutputEvent`s
    /// through the given channel.
    ///
    /// # Arguments
    /// * `session_id` — Database/session ID for payload tagging
    /// * `session` — The live `PtySession` (ownership transferred)
    /// * `tx` — Channel sender for `PtyOutputEvent`s
    pub fn start(
        session_id: i64,
        session: PtySession,
        tx: mpsc::Sender<PtyOutputEvent>,
    ) -> Self {
        let handle = std::thread::spawn(move || {
            // Clone reader before entering the loop
            let reader = match session.try_clone_reader() {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("[pty-output-{}] failed to clone reader: {}", session_id, e);
                    let _ = tx.send(PtyOutputEvent::Exit(build_exit_payload(session_id, -1)));
                    return;
                }
            };

            // Spawn the blocking output reader (reads PTY → mpsc Vec<u8>)
            let (data_tx, data_rx) = mpsc::channel::<Vec<u8>>();
            let reader_handle = pty::spawn_output_reader(reader, data_tx);

            // Forward loop: read chunks from data_rx → encode → send as PtyOutputEvent
            while let Ok(chunk) = data_rx.recv() {
                let payload = build_output_payload(session_id, &chunk);
                if tx.send(PtyOutputEvent::Output(payload)).is_err() {
                    break; // consumer disconnected
                }
            }

            // Reader finished (EOF or error) — wait for thread cleanup
            let _ = reader_handle.join();

            // Send exit notification
            let exit_code = session.try_get_exit_code().unwrap_or(-1);

            let _ = tx.send(PtyOutputEvent::Exit(build_exit_payload(session_id, exit_code)));
        });

        Self { handle: Some(handle) }
    }

    /// Check if the output loop thread is still running.
    pub fn is_running(&self) -> bool {
        self.handle.as_ref().map(|h| !h.is_finished()).unwrap_or(false)
    }

    /// Check if the output loop thread has finished.
    pub fn is_finished(&self) -> bool {
        self.handle.as_ref().map(|h| h.is_finished()).unwrap_or(true)
    }

    /// Block until the output loop finishes, returning the join handle result.
    pub fn join(mut self) -> Result<(), Box<dyn std::any::Any + Send + 'static>> {
        if let Some(h) = self.handle.take() {
            h.join()
        } else {
            Ok(())
        }
    }
}

impl Drop for PtyOutputLoop {
    fn drop(&mut self) {
        // Intentionally do NOT join here — dropping detaches the thread.
        // The thread will exit on its own when the PTY reader hits EOF.
        // Joining in Drop would block the caller unexpectedly.
    }
}
