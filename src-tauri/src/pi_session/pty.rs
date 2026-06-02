//! PTY (pseudo-terminal) support for interactive Pi sessions.
//!
//! Uses `portable-pty` to spawn Pi in a terminal-emulated session,
//! providing bidirectional stdin/stdout via a master/slave PTY pair.
//!
//! Interior mutability via `std::sync::Mutex` ensures `Send + Sync`,
//! required for storage in Tauri's managed `State`.

use portable_pty::{CommandBuilder, ChildKiller, MasterPty, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};

/// Default terminal dimensions for new PTY sessions.
pub const DEFAULT_PTY_COLS: u16 = 80;
pub const DEFAULT_PTY_ROWS: u16 = 24;

/// Returns the default PtySize used when creating a new PTY.
pub fn default_pty_size() -> PtySize {
    PtySize {
        rows: DEFAULT_PTY_ROWS,
        cols: DEFAULT_PTY_COLS,
        pixel_width: 0,
        pixel_height: 0,
    }
}

/// A running PTY session with owned handles to the master end and child process.
///
/// All interior fields are wrapped in `Arc<Mutex<>>` to satisfy `Send + Sync`
/// bounds required by Tauri's `State` manager (which stores `SessionRegistry`
/// containing `RunningSession` → `SessionProcess::Pty(PtySession)`).
pub struct PtySession {
    /// Master PTY handle — used for resize, cloning reader/writer.
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    /// Child process handle — used for wait/kill.
    child: Arc<Mutex<Box<dyn ChildKiller + Send + 'static>>>,
    /// Writer handle to PTY stdin (taken once from master).
    writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
}

// Safety: all inner types are Send (portable-pty guarantees this for
// native implementations). Mutex provides Sync.
unsafe impl Send for PtySession {}
unsafe impl Sync for PtySession {}

impl std::fmt::Debug for PtySession {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("PtySession")
            .field("writer_present", &self.writer.lock().unwrap().is_some())
            .finish()
    }
}

impl PtySession {
    /// Spawn a new PTY session running the given command.
    ///
    /// Creates a native PTY pair, spawns the command into the slave side,
    /// and retains the master side for I/O and resize control.
    pub fn spawn(
        binary: &str,
        args: &[String],
        size: Option<PtySize>,
    ) -> Result<Self, PtyError> {
        let pty_system = NativePtySystem::default();
        let size = size.unwrap_or_else(default_pty_size);
        let pair = pty_system
            .openpty(size)
            .map_err(|e| PtyError::SpawnFailed(e.to_string()))?;

        let mut cmd = CommandBuilder::new(binary);
        for arg in args {
            cmd.arg(arg);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| PtyError::SpawnFailed(e.to_string()))?;

        // Take writer early; drop slave to avoid deadlock
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| PtyError::IoError(e.to_string()))?;

        Ok(Self {
            master: Arc::new(Mutex::new(pair.master)),
            child: Arc::new(Mutex::new(child)),
            writer: Arc::new(Mutex::new(Some(writer))),
        })
    }

    /// Write bytes to the PTY stdin (sends input to child process).
    pub fn write(&self, data: &[u8]) -> Result<usize, PtyError> {
        let mut w = self.writer.lock().map_err(|_| PtyError::Poisoned)?;
        match w.as_mut() {
            Some(writer) => writer.write(data).map_err(|e| PtyError::IoError(e.to_string())),
            None => Err(PtyError::WriterTaken),
        }
    }

    /// Clone a reader handle for the PTY stdout.
    pub fn try_clone_reader(&self) -> Result<Box<dyn Read + Send>, PtyError> {
        let m = self.master.lock().map_err(|_| PtyError::Poisoned)?;
        m.try_clone_reader().map_err(|e| PtyError::IoError(e.to_string()))
    }

    /// Resize the PTY window (sends SIGWINCH to child).
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), PtyError> {
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        let m = self.master.lock().map_err(|_| PtyError::Poisoned)?;
        m.resize(size).map_err(|e| PtyError::ResizeFailed(e.to_string()))
    }

    /// Get current PTY size.
    pub fn get_size(&self) -> Result<PtySize, PtyError> {
        let m = self.master.lock().map_err(|_| PtyError::Poisoned)?;
        m.get_size().map_err(|e| PtyError::IoError(e.to_string()))
    }

    /// Signal the child process to terminate.
    pub fn kill(&self) -> Result<(), PtyError> {
        let mut c = self.child.lock().map_err(|_| PtyError::Poisoned)?;
        c.kill().map_err(|e| PtyError::KillFailed(e.to_string()))
    }

    /// Try to get the exit code of the child process.
    /// Note: portable-pty's ChildKiller trait does not expose try_wait(),
    /// so this always returns None. The actual exit code is determined
    /// by the output loop when the reader hits EOF.
    pub fn try_get_exit_code(&self) -> Option<i32> {
        // ChildKiller trait doesn't provide non-blocking exit status.
        // The output loop handles exit detection via reader EOF.
        None
    }

    /// Drop the writer (sends EOF to child). Returns true if writer was present.
    pub fn close_writer(&self) -> bool {
        if let Ok(mut w) = self.writer.lock() {
            w.take().is_some()
        } else {
            false
        }
    }
}

// -- Errors --

#[derive(Debug, thiserror::Error)]
pub enum PtyError {
    #[error("PTY spawn failed: {0}")]
    SpawnFailed(String),

    #[error("IO error: {0}")]
    IoError(String),

    #[error("PTY resize failed: {0}")]
    ResizeFailed(String),

    #[error("Failed to kill child: {0}")]
    KillFailed(String),

    #[error("Writer already consumed")]
    WriterTaken,

    #[error("Mutex poisoned")]
    Poisoned,
}

// -- Tests --

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_pty_size_is_80x24() {
        let size = default_pty_size();
        assert_eq!(size.cols, 80);
        assert_eq!(size.rows, 24);
        assert_eq!(size.pixel_width, 0);
        assert_eq!(size.pixel_height, 0);
    }

    #[test]
    fn custom_pty_size_accepted_by_spawn() {
        // Use /usr/bin/true as a minimal test binary that exits immediately
        let result = PtySession::spawn("/usr/bin/true", &[], Some(PtySize {
            rows: 120,
            cols: 40,
            pixel_width: 0,
            pixel_height: 0,
        }));
        assert!(result.is_ok(), "spawn with custom size should succeed: {:?}", result.err());
    }

    #[test]
    fn spawn_fails_for_nonexistent_binary() {
        let result = PtySession::spawn("/nonexistent/binary/path", &[], None);
        assert!(result.is_err());
        match result.unwrap_err() {
            PtyError::SpawnFailed(_) => {}
            other => panic!("expected SpawnFailed, got: {:?}", other),
        }
    }

    #[test]
    fn get_size_returns_spawned_dimensions() {
        let session = PtySession::spawn("/usr/bin/true", &[], None).unwrap();
        let size = session.get_size().unwrap();
        assert_eq!(size.cols, 80);
        assert_eq!(size.rows, 24);
    }

    #[test]
    fn clone_reader_succeeds_on_live_session() {
        let session = PtySession::spawn("/usr/bin/true", &[], None).unwrap();
        let reader = session.try_clone_reader();
        assert!(reader.is_ok(), "clone reader should succeed on live session");
    }

    #[test]
    fn write_to_true_process_succeeds_or_eofs() {
        let session = PtySession::spawn("/usr/bin/true", &[], None).unwrap();
        // /usr/bin/true ignores stdin and exits quickly; write may succeed or EOF
        let result = session.write(b"hello\n");
        // Either OK (bytes written) or error is acceptable for exited process
        // We just care it doesn't panic
        let _ = result;
    }

    #[test]
    fn write_and_read_roundtrip_preserves_data() {
        use std::thread;
        use std::time::Duration;

        // Spawn /bin/cat — echoes stdin to stdout
        let session = PtySession::spawn("/bin/cat", &[], None).unwrap();

        // Clone reader BEFORE we might drop the session
        let mut reader = session.try_clone_reader().unwrap();

        // Write test data
        session.write(b"pty-test-data\n").expect("write should succeed");

        // Give cat time to read the input before we EOF it
        thread::sleep(Duration::from_millis(100));

        // Drop writer to send EOF so cat exits
        assert!(session.close_writer());

        // Give cat time to process, echo output, and exit
        thread::sleep(Duration::from_millis(500));

        // Read output (with retry — PTY output can be slow to arrive)
        let mut buf = [0u8; 256];
        let mut output = String::new();
        for _ in 0..10 {
            let n = reader.read(&mut buf).unwrap_or(0);
            if n > 0 {
                output.push_str(&String::from_utf8_lossy(&buf[..n]));
            }
            if output.contains("pty-test-data") {
                break;
            }
            thread::sleep(Duration::from_millis(100));
        }

        assert!(output.contains("pty-test-data"),
            "expected output to contain 'pty-test-data', got: {:?}", output);
    }

    #[test]
    fn resize_changes_pty_dimensions() {
        let session = PtySession::spawn("/usr/bin/true", &[], None).unwrap();

        // Verify default size
        let size = session.get_size().unwrap();
        assert_eq!(size.cols, 80);
        assert_eq!(size.rows, 24);

        // Resize
        session.resize(120, 50).expect("resize should succeed");

        // Verify new size
        let size = session.get_size().unwrap();
        assert_eq!(size.cols, 120, "cols should be 120 after resize");
        assert_eq!(size.rows, 50, "rows should be 50 after resize");
    }

    #[test]
    fn close_writer_returns_true_once_then_false() {
        let session = PtySession::spawn("/usr/bin/true", &[], None).unwrap();
        assert!(session.close_writer(), "first close should return true");
        assert!(!session.close_writer(), "second close should return false");
    }
}

// -- PTY Output Reader (background task) --

use std::sync::mpsc;

/// Spawn a blocking task that reads from a PTY reader and sends chunks
/// via the given channel. Returns the join handle for the background task.
///
/// The task runs until:
/// - The reader returns EOF (child exited / PTY closed)
/// - An IO error occurs
/// - The sender channel is dropped (consumer disconnected)
pub fn spawn_output_reader(
    mut reader: Box<dyn Read + Send>,
    tx: mpsc::Sender<Vec<u8>>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    let chunk = buf[..n].to_vec();
                    if tx.send(chunk).is_err() {
                        break; // consumer disconnected
                    }
                }
                Err(_) => break, // IO error or closed
            }
        }
    })
}

#[cfg(test)]
mod output_reader_tests {
    use super::*;

    #[test]
    fn output_reader_captures_pty_data() {
        use std::thread;
        use std::time::Duration;

        // Spawn /bin/echo in a PTY — it writes its args to stdout and exits
        let session = PtySession::spawn("/bin/echo", &["hello-from-pty".to_string()], None).unwrap();
        let reader = session.try_clone_reader().unwrap();

        let (tx, rx) = mpsc::channel::<Vec<u8>>();
        let handle = spawn_output_reader(reader, tx);

        // Give echo time to exit and produce output
        thread::sleep(Duration::from_millis(500));

        // Collect all output chunks
        let mut output = Vec::new();
        while let Ok(chunk) = rx.try_recv() {
            output.extend_from_slice(&chunk);
        }

        let text = String::from_utf8_lossy(&output);
        assert!(text.contains("hello-from-pty"),
            "expected 'hello-from-pty' in output, got: {:?}", text);

        handle.join().expect("output reader should clean up");
    }

    #[test]
    fn output_reader_exits_on_eof() {
        // Use /usr/bin/true — exits immediately with no output
        let session = PtySession::spawn("/usr/bin/true", &[], None).unwrap();
        let reader = session.try_clone_reader().unwrap();

        let (tx, rx) = mpsc::channel();
        let handle = spawn_output_reader(reader, tx);

        // Wait for reader to finish
        use std::time::{Duration, Instant};
        let deadline = Instant::now() + Duration::from_secs(2);
        while !handle.is_finished() {
            if Instant::now() > deadline {
                panic!("output reader did not exit within timeout");
            }
            std::thread::sleep(Duration::from_millis(50));
        }

        // Should have no output (true produces nothing)
        while let Ok(_chunk) = rx.try_recv() {}

        handle.join().expect("output reader should clean up");
    }
}
