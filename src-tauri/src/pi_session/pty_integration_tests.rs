/// Integration tests for the full PTY output pipeline.
///
/// Exercises the complete data path that `session_launch` wires together:
///
///   PtySession::spawn()
///     → PtyOutputLoop::start()  [clones reader, spawns blocking read thread]
///       → mpsc channel  [PtyOutputEvent stream]
///         → Consumer receives Output(base64) + Exit(code) events
///
/// These tests use real PTY sessions (/bin/echo, /usr/bin/printf) and verify
/// the exact wire format that the frontend will consume via Tauri events.

use std::sync::mpsc;
use std::time::{Duration, Instant};

use crate::pi_session::pty::PtySession;
use crate::pi_session::pty_output::{
    build_exit_payload, build_output_payload, PtyOutputEvent, PtyOutputLoop,
    PtyExitPayload, PtyOutputPayload,
};

// ─── Helpers ───────────────────────────────────────────────────────

/// Collect all PtyOutputEvents from the receiver within a timeout.
fn collect_events(rx: &mpsc::Receiver<PtyOutputEvent>, timeout_secs: u64) -> Vec<PtyOutputEvent> {
    let mut events = Vec::new();
    let deadline = Instant::now() + Duration::from_secs(timeout_secs);
    while Instant::now() < deadline {
        match rx.try_recv() {
            Ok(event) => events.push(event),
            Err(mpsc::TryRecvError::Empty) => {
                std::thread::sleep(Duration::from_millis(30));
            }
            Err(mpsc::TryRecvError::Disconnected) => break,
        }
    }
    // Final drain in case events arrived during last sleep
    while let Ok(event) = rx.try_recv() {
        events.push(event);
    }
    events
}

/// Assert that a timestamp string is valid RFC3339.
fn assert_rfc3339(ts: &str) {
    // chrono::DateTime::parse_from_rfc3339 accepts the format
    assert!(
        chrono::DateTime::parse_from_rfc3339(ts).is_ok(),
        "timestamp '{}' is not valid RFC3339",
        ts
    );
}

// ─── Test: Full Pipeline — Echo Command ────────────────────────────

#[test]
fn integration_echo_produces_output_and_exit_events() {
    // Arrange: spawn /bin/echo which writes to stdout then exits immediately
    let session =
        PtySession::spawn("/bin/echo", &["hello-integration".to_string()], None).expect("spawn");

    let (tx, rx) = mpsc::channel::<PtyOutputEvent>();

    // Act: start the full output loop (this is what session_launch does)
    let _loop = PtyOutputLoop::start(100, session, tx);

    // Assert: collect events
    let events = collect_events(&rx, 3);

    // Must have at least one Output and one Exit
    let outputs: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            PtyOutputEvent::Output(p) => Some(p.clone()),
            _ => None,
        })
        .collect();

    let exits: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            PtyOutputEvent::Exit(p) => Some(p.clone()),
            _ => None,
        })
        .collect();

    assert!(!outputs.is_empty(), "expected ≥1 Output event, got {} events", events.len());
    assert!(!exits.is_empty(), "expected ≥1 Exit event, got {} events", events.len());

    // Verify output contains our echo string (base64-encoded)
    use base64::Engine;
    let decoded_outputs: Vec<String> = outputs
        .into_iter()
        .map(|p| {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(&p.data)
                .expect("valid base64");
            String::from_utf8_lossy(&bytes).to_string()
        })
        .collect();

    let combined = decoded_outputs.join(" ");
    assert!(
        combined.contains("hello-integration"),
        "expected output containing 'hello-integration', got: {:?}",
        combined
    );
}

// ─── Test: Session ID Propagation ──────────────────────────────────

#[test]
fn integration_session_id_propagates_through_pipeline() {
    const TEST_SID: i64 = 77777;

    let session = PtySession::spawn("/usr/bin/printf", &["sid-test\n".to_string()], None).expect("spawn");

    let (tx, rx) = mpsc::channel::<PtyOutputEvent>();
    let _loop = PtyOutputLoop::start(TEST_SID, session, tx);

    let events = collect_events(&rx, 3);

    // Every event must carry the same session_id
    for event in &events {
        match event {
            PtyOutputEvent::Output(p) => {
                assert_eq!(p.session_id, TEST_SID, "Output event has wrong sessionId");
            }
            PtyOutputEvent::Exit(p) => {
                assert_eq!(p.session_id, TEST_SID, "Exit event has wrong sessionId");
            }
        }
    }

    assert!(!events.is_empty(), "expected events but got none");
}

// ─── Test: Timestamp Format ───────────────────────────────────────

#[test]
fn integration_timestamps_are_valid_rfc3339() {
    let session = PtySession::spawn("/usr/bin/printf", &["ts-test".to_string()], None).expect("spawn");

    let (tx, rx) = mpsc::channel::<PtyOutputEvent>();
    let _loop = PtyOutputLoop::start(55, session, tx);

    let events = collect_events(&rx, 3);

    assert!(!events.is_empty(), "expected events");

    for event in &events {
        match event {
            PtyOutputEvent::Output(p) => assert_rfc3339(&p.timestamp),
            PtyOutputEvent::Exit(p) => assert_rfc3339(&p.timestamp),
        }
    }
}

// ─── Test: JSON Serialization Round-Trip ──────────────────────────
//
// Verifies that payloads serialize to the exact JSON shape the frontend
// expects when emitted via app.emit().

#[test]
fn integration_output_payload_serializes_to_frontend_shape() {
    let payload = build_output_payload(42, b"\x1b[32mhello\x1b[0m"); // ANSI green text
    let json = serde_json::to_value(&payload).expect("serialize");

    // Frontend expects camelCase keys
    assert_eq!(json["sessionId"].as_i64(), Some(42));
    assert!(json["data"].is_string());
    assert!(json["timestamp"].is_string());

    // Data should be base64 of the raw bytes (including ANSI escapes)
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(json["data"].as_str().unwrap())
        .expect("valid base64");
    assert_eq!(decoded, b"\x1b[32mhello\x1b[0m");
}

#[test]
fn integration_exit_payload_serializes_to_frontend_shape() {
    let payload = build_exit_payload(42, 0);
    let json = serde_json::to_value(&payload).expect("serialize");

    assert_eq!(json["sessionId"].as_i64(), Some(42));
    assert_eq!(json["code"].as_i64(), Some(0));
    assert!(json["timestamp"].is_string());
}

// ─── Test: Base64 Decoding on Frontend Path ───────────────────────
//
// Simulates what the frontend PtyStore does: receive base64 string → decode → UTF-8.

#[test]
fn integration_base64_roundtrip_matches_frontend_decode_path() {
    use base64::Engine;

    // Simulate PTY output that includes ANSI escape codes, newlines, unicode
    let raw = "\x1b[1;31merror:\x1b[0m テスト\n".as_bytes();
    let payload = build_output_payload(1, raw);

    // This is what the frontend receives via Tauri IPC
    let json_str = serde_json::to_string(&payload).expect("json");
    let parsed: serde_json::Value = serde_json::from_str(&json_str).expect("parse");

    // Frontend extracts .data (base64 string) and decodes
    let b64_data = parsed["data"].as_str().unwrap();
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(b64_data)
        .expect("frontend decode");
    let text = String::from_utf8(decoded).expect("utf8");

    assert!(text.contains("error:"));
    assert!(text.contains("テスト"));
}

// ─── Test: Multi-Line Output ──────────────────────────────────────

#[test]
fn integration_multiline_output_preserved_in_order() {
    // printf with \n produces multiple lines in one write
    let session = PtySession::spawn(
        "/usr/bin/printf",
        &["line-one\nline-two\nline-three\n".to_string()],
        None,
    )
    .expect("spawn");

    let (tx, rx) = mpsc::channel::<PtyOutputEvent>();
    let _loop = PtyOutputLoop::start(333, session, tx);

    let events = collect_events(&rx, 3);

    let outputs: Vec<String> = events
        .into_iter()
        .filter_map(|e| match e {
            PtyOutputEvent::Output(p) => {
                use base64::Engine;
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(&p.data)
                    .ok()?;
                Some(String::from_utf8_lossy(&bytes).to_string())
            }
            _ => None,
        })
        .collect();

    let combined = outputs.join("");
    assert!(
        combined.contains("line-one"),
        "missing line-one, got: {:?}",
        combined
    );
    assert!(
        combined.contains("line-two"),
        "missing line-two, got: {:?}",
        combined
    );
    assert!(
        combined.contains("line-three"),
        "missing line-three, got: {:?}",
        combined
    );

    // Order must be preserved
    let pos_one = combined.find("line-one").unwrap();
    let pos_two = combined.find("line-two").unwrap();
    let pos_three = combined.find("line-three").unwrap();
    assert!(pos_one < pos_two, "lines out of order: one before two");
    assert!(pos_two < pos_three, "lines out of order: two before three");
}

// ─── Test: Exit Event Always Last ─────────────────────────────────

#[test]
fn integration_exit_event_is_always_last() {
    let session = PtySession::spawn("/usr/bin/printf", &["last-test\n".to_string()], None).expect("spawn");

    let (tx, rx) = mpsc::channel::<PtyOutputEvent>();
    let _loop = PtyOutputLoop::start(88, session, tx);

    let events = collect_events(&rx, 3);

    if events.len() >= 2 {
        // The last event should be Exit
        match &events[events.len() - 1] {
            PtyOutputEvent::Exit(_) => {} // good
            other => panic!("last event should be Exit, got: {:?}", other),
        }
    }
}

// ─── Test: Empty Output Process ───────────────────────────────────

#[test]
fn integration_no_output_process_still_sends_exit() {
    // /usr/bin/true exits 0 with no stdout output
    let session = PtySession::spawn("/usr/bin/true", &[], None).expect("spawn");

    let (tx, rx) = mpsc::channel::<PtyOutputEvent>();
    let _loop = PtyOutputLoop::start(1, session, tx);

    let events = collect_events(&rx, 2);

    // Should have at least an Exit event even with no output
    let has_exit = events.iter().any(|e| matches!(e, PtyOutputEvent::Exit(_)));
    assert!(has_exit, "expected Exit event even for no-output process, got {} events", events.len());
}
