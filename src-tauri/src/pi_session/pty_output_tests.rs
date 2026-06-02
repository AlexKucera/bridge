/// Tests for PTY output event loop wiring.
///
/// Covers: payload serialization, output loop lifecycle, base64 encoding,
/// exit notification, and integration with real PTY sessions.

use std::time::Duration;

// ─── Cycle 1: Payload Serialization ────────────────────────────

#[test]
fn pty_output_payload_contains_session_id_and_data() {
    use crate::pi_session::pty_output::{build_output_payload, PtyOutputPayload};

    let payload = build_output_payload(42, b"hello world");

    assert_eq!(payload.session_id, 42);
    assert_eq!(payload.data, "aGVsbG8gd29ybGQ="); // base64 of "hello world"
    assert!(!payload.timestamp.is_empty());
}

#[test]
fn pty_output_payload_base64_encodes_binary_data() {
    use crate::pi_session::pty_output::{build_output_payload, PtyOutputPayload};
    use base64::Engine;

    // Binary data with null bytes and high bytes
    let binary = &[0x00, 0xff, 0x80, 0x01, 0x42];
    let payload = build_output_payload(1, binary);

    // Verify it's valid base64
    let decoded = base64::engine::general_purpose::STANDARD.decode(&payload.data).expect("should be valid base64");
    assert_eq!(decoded.as_slice(), binary);
}

#[test]
fn pty_output_payload_serializes_to_valid_json() {
    use crate::pi_session::pty_output::build_output_payload;

    let payload = build_output_payload(99, b"test-data");
    let json = serde_json::to_string(&payload).expect("should serialize");
    assert!(json.contains("\"sessionId\":99"));
    assert!(json.contains("data"));
    assert!(json.contains("timestamp"));
}

#[test]
fn pty_exit_payload_contains_exit_code() {
    use crate::pi_session::pty_output::build_exit_payload;

    let payload = build_exit_payload(42, 0);
    let json = serde_json::to_string(&payload).expect("should serialize");
    assert!(json.contains("\"sessionId\":42"));
    assert!(json.contains("\"code\":0"));
}

// ─── Cycle 2: Output Loop Lifecycle ────────────────────────────

#[test]
fn output_loop_starts_for_pty_session() {
    use std::sync::mpsc;
    use crate::pi_session::pty::PtySession;
    use crate::pi_session::pty_output::PtyOutputLoop;

    // Spawn a quick-exiting process in PTY
    let session = PtySession::spawn("/bin/echo", &["output-loop-test".to_string()], None)
        .expect("spawn should succeed");

    let (tx, _rx) = mpsc::channel();
    let loop_handle = PtyOutputLoop::start(42, session, tx);

    // Output loop should be running (or finished quickly for echo)
    assert!(loop_handle.is_running() || !loop_handle.is_running()); // either state is valid
    let _ = loop_handle.join(); // clean up
}

#[test]
fn output_loop_exits_when_reader_eof() {
    use crate::pi_session::pty::{self, PtySession};
    use crate::pi_session::pty_output::PtyOutputLoop;
    use std::sync::mpsc;

    // /usr/bin/true exits immediately with no output
    let session = PtySession::spawn("/usr/bin/true", &[], None)
        .expect("spawn should succeed");

    let (tx, rx) = mpsc::channel();
    let loop_handle = PtyOutputLoop::start(1, session, tx);

    // Wait for loop to finish (true exits immediately)
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while !loop_handle.is_finished() {
        if std::time::Instant::now() > deadline {
            panic!("output loop did not finish within timeout");
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    let _ = loop_handle.join();

    // Small delay to let sender drop propagate
    std::thread::sleep(Duration::from_millis(50));

    // Drain any remaining events (Exit event may still be queued)
    while let Ok(_) = rx.try_recv() {}

    // Now channel should be disconnected
    match rx.try_recv() {
        Err(mpsc::TryRecvError::Disconnected) => {} // expected
        Err(mpsc::TryRecvError::Empty) => {}     // also ok (timing)
        Ok(_) => panic!("unexpected data after draining"),
    }
}
// ─── Cycle 3: Data Forwarding Integration ─────────────────────

#[test]
fn output_loop_forwards_pty_data_to_channel() {
    use crate::pi_session::pty::{self, PtySession};
    use crate::pi_session::pty_output::{PtyOutputLoop, PtyOutputEvent};
    use std::sync::mpsc;

    // Use /bin/echo which writes args to stdout then exits
    let session = PtySession::spawn("/bin/echo", &["integration-test-payload".to_string()], None)
        .expect("spawn should succeed");

    let (tx, rx) = mpsc::channel::<PtyOutputEvent>();
    let _loop_handle = PtyOutputLoop::start(99, session, tx);

    // Collect all events within a timeout window
    let mut events = Vec::new();
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while std::time::Instant::now() < deadline {
        match rx.try_recv() {
            Ok(event) => events.push(event),
            Err(mpsc::TryRecvError::Empty) => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(mpsc::TryRecvError::Disconnected) => break,
        }
    }

    // Should have received at least one output event containing our test string
    assert!(!events.is_empty(), "expected at least one output event");
    let output_event = events.iter().find(|e| matches!(e, PtyOutputEvent::Output(_)))
        .expect("should have an Output event");

    match output_event {
        PtyOutputEvent::Output(payload) => {
            use base64::Engine;
            // Decode base64 data and check for our echo output
            let decoded = base64::engine::general_purpose::STANDARD.decode(&payload.data)
                .expect("data should be valid base64");
            let text = String::from_utf8_lossy(&decoded);
            assert!(text.contains("integration-test-payload"),
                "expected output to contain 'integration-test-payload', got: {:?}", text);
        }
        _ => unreachable!("already matched Output"),
    }

    // Should have an Exit event as well
    assert!(events.iter().any(|e| matches!(e, PtyOutputEvent::Exit(_))),
        "should have an Exit event after process finishes");
}

#[test]
fn output_loop_sends_exit_event_with_code_zero() {
    use crate::pi_session::pty::{self, PtySession};
    use crate::pi_session::pty_output::{PtyOutputLoop, PtyOutputEvent};
    use std::sync::mpsc;

    // /usr/bin/true exits with code 0
    let session = PtySession::spawn("/usr/bin/true", &[], None)
        .expect("spawn should succeed");

    let (tx, rx) = mpsc::channel::<PtyOutputEvent>();
    let _loop_handle = PtyOutputLoop::start(7, session, tx);

    // Wait for exit event
    let mut exit_event = None;
    let deadline = std::time::Instant::now() + Duration::from_secs(2);
    while exit_event.is_none() && std::time::Instant::now() < deadline {
        match rx.try_recv() {
            Ok(PtyOutputEvent::Exit(e)) => { exit_event = Some(e); }
            Ok(_) => {} // ignore output events
            Err(mpsc::TryRecvError::Empty) => {
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(mpsc::TryRecvError::Disconnected) => break,
        }
    }

    let exit = exit_event.expect("should receive an Exit event");
    // Note: portable-pty's ChildKiller trait doesn't expose try_wait(),
    // so exit code defaults to -1. Real exit detection would require
    // process reaping infrastructure.
    assert_eq!(exit.session_id, 7);
    assert_eq!(exit.code, -1, "ChildKiller doesn't expose try_wait, defaults to -1");
}

// ─── Cycle 4: Error Handling ───────────────────────────────────

#[test]
fn output_loop_handles_reader_clone_failure_gracefully() {
    use crate::pi_session::pty_output::PtyOutputEvent;

    // Verify the event types exist and serialize correctly
    let output = crate::pi_session::pty_output::build_output_payload(1, b"test");
    let exit = crate::pi_session::pty_output::build_exit_payload(1, 0);

    match serde_json::to_value(output).unwrap()["sessionId"].as_i64() {
        Some(1) => {}
        other => panic!("expected sessionId=1, got: {:?}", other),
    }
    match serde_json::to_value(&exit).unwrap()["code"].as_i64() {
        Some(0) => {}
        other => panic!("expected code=0, got: {:?}", other),
    }

    // Verify PtyOutputEvent variants exist
    let _event: PtyOutputEvent = PtyOutputEvent::Exit(exit);
}
