/* events — Throttled event emitter

   Batches rapid events and enforces per-channel rate limits
   before emitting to the frontend via Tauri's event system.

   # Channels

   Frontend subscribers listen on named channels:
   - `execution-update` — state changes, turn updates, tool calls
   - `captains-log-event` — log-worthy session events
   - `activity-feed-event` — activity feed entries
   - `engine-room-update` — metrics, cost, performance data */

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;

// ─── Channel Names ────────────────────────────────────────────

/// All event channels used by Bridge.
pub const CHANNELS: &[&str] = &[
    "execution-update",
    "captains-log-event",
    "activity-feed-event",
    "engine-room-update",
];

// ─── Emitted Event ───────────────────────────────────────────

/// A single throttled event destined for a frontend channel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmittedEvent {
    pub channel: String,
    pub payload: serde_json::Value,
    pub emitted_at: String,
}

impl EmittedEvent {
    fn new(channel: &str, payload: serde_json::Value) -> Self {
        EmittedEvent {
            channel: channel.to_string(),
            payload,
            emitted_at: format!("{:?}", Instant::now()),
        }
    }
}

// ─── Errors ──────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum EmitError {
    #[error("Rate limited: channel '{channel}' has exceeded {max}/s")]
    RateLimited { channel: String, max: u64 },
}

// ─── Event Emitter ───────────────────────────────────────────

/// Batches rapid events and enforces per-channel rate limits.

/// ```no_run
/// # use bridge_lib::events::{EventEmitter, EmitError};
/// let mut emitter = EventEmitter::new();
/// // emit() queues events; flush() drains them
/// let _ = emitter.emit("ch", serde_json::json!({}));
/// if emitter.should_flush() { let _ = emitter.flush(); }
/// ```
#[derive(Debug)]
pub struct EventEmitter {
    batch_interval_ms: u64,
    max_per_second: u64,
    channel_counts: HashMap<String, u64>,
    pending: Vec<EmittedEvent>,
    last_flush: Instant,
    last_rate_reset: Instant,
}

impl EventEmitter {
    /// Create emitter with defaults: 50ms batch interval, 60/sec rate cap.
    pub fn new() -> Self {
        Self::with_config(50, 60)
    }

    /// Create emitter with custom throttling parameters.
    pub fn with_config(batch_interval_ms: u64, max_per_second: u64) -> Self {
        let now = Instant::now();
        EventEmitter {
            batch_interval_ms,
            max_per_second,
            channel_counts: HashMap::new(),
            pending: Vec::new(),
            last_flush: now,
            last_rate_reset: now,
        }
    }

    /// Queue an event for emission.
    ///
    /// Returns `EmitRateLimited` if the channel has exceeded `max_per_second`
    /// in the current 1-second window. Otherwise adds to pending buffer.
    pub fn emit(
        &mut self,
        channel: &str,
        payload: serde_json::Value,
    ) -> Result<(), EmitError> {
        // Reset per-second counters if window expired
        if self.last_rate_reset.elapsed().as_secs() >= 1 {
            self.channel_counts.clear();
            self.last_rate_reset = Instant::now();
        }

        let count = self.channel_counts.entry(channel.to_string()).or_insert(0);
        if *count >= self.max_per_second {
            return Err(EmitError::RateLimited {
                channel: channel.to_string(),
                max: self.max_per_second,
            });
        }
        *count += 1;

        self.pending.push(EmittedEvent::new(channel, payload));
        Ok(())
    }

    /// Drain all pending events and return them.
    ///
    /// Call this when `should_flush()` returns true, or periodically.
    /// Resets the flush timer but NOT the rate-limit counters (those
    /// auto-reset on time window expiry in `emit()`).
    pub fn flush(&mut self) -> Vec<EmittedEvent> {
        self.last_flush = Instant::now();
        std::mem::take(&mut self.pending)
    }

    /// Returns true if `batch_interval_ms` has elapsed since last flush.
    pub fn should_flush(&self) -> bool {
        self.last_flush.elapsed().as_millis() as u64 >= self.batch_interval_ms
    }

    /// Returns the number of events currently pending (not yet flushed).
    pub fn pending_count(&self) -> usize {
        self.pending.len()
    }

    /// Returns the current count of emitted (but not necessarily flushed)
    /// events for a given channel in the current rate-limit window.
    pub fn channel_count(&self, channel: &str) -> u64 {
        self.channel_counts.get(channel).copied().unwrap_or(0)
    }
}

impl Default for EventEmitter {
    fn default() -> Self {
        Self::new()
    }
}

// ─── StateChange → Channel Mapping ───────────────────────────

/// Map a pi_state::StateChange into one or more (channel, payload) pairs
/// suitable for emission.
pub fn map_state_change(
    session_id: &str,
    change: &crate::pi_state::StateChange,
) -> Vec<(String, serde_json::Value)> {
    use crate::pi_state::{LiveState, StateChange};
    match change {
        StateChange::SessionStatusChanged(state) => vec![(
            "execution-update".to_string(),
            serde_json::json!({
                "type": "status_changed",
                "sessionId": session_id,
                "status": format!("{:?}", state),
            }),
        )],

        StateChange::NewTurn(turn_id) => vec![(
            "execution-update".to_string(),
            serde_json::json!({
                "type": "new_turn",
                "sessionId": session_id,
                "turnId": *turn_id,
            }),
        )],

        StateChange::TurnUpdated(turn_id) => vec![(
            "execution-update".to_string(),
            serde_json::json!({
                "type": "turn_updated",
                "sessionId": session_id,
                "turnId": *turn_id,
            }),
        )],

        StateChange::NewToolCall { turn_id, tool_id } => vec![(
            "execution-update".to_string(),
            serde_json::json!({
                "type": "new_tool_call",
                "sessionId": session_id,
                "turnId": *turn_id,
                "toolId": tool_id,
            }),
        )],

        StateChange::ToolCallUpdated { turn_id, tool_id } => vec![(
            "execution-update".to_string(),
            serde_json::json!({
                "type": "tool_call_updated",
                "sessionId": session_id,
                "turnId": *turn_id,
                "toolId": tool_id,
            }),
        )],

        StateChange::MetricsUpdated => vec![
            (
                "execution-update".to_string(),
                serde_json::json!({
                    "type": "metrics_updated",
                    "sessionId": session_id,
                }),
            ),
            (
                "engine-room-update".to_string(),
                serde_json::json!({
                    "type": "metrics_updated",
                    "sessionId": session_id,
                }),
            ),
        ],
    }
}

// ─── Tests ───────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Cycle 1: EmittedEvent construction ──────────────────

    #[test]
    fn emitted_event_stores_channel_and_payload() {
        let ev = EmittedEvent::new("execution-update", serde_json::json!({"key": "val"}));
        assert_eq!(ev.channel, "execution-update");
        assert_eq!(ev.payload["key"], "val");
        assert!(!ev.emitted_at.is_empty());
    }

    #[test]
    fn emitted_event_serializes_to_valid_json() {
        let ev = EmittedEvent::new("test", serde_json::json!({"n": 42}));
        let json = serde_json::to_string(&ev).expect("should serialize");
        assert!(json.contains("test"));
        assert!(json.contains("42"));
    }

    // ── Cycle 2: CHANNELS constant ─────────────────────────

    #[test]
    fn channels_contains_all_four_channels() {
        assert_eq!(CHANNELS.len(), 4);
        assert!(CHANNELS.contains(&"execution-update"));
        assert!(CHANNELS.contains(&"captains-log-event"));
        assert!(CHANNELS.contains(&"activity-feed-event"));
        assert!(CHANNELS.contains(&"engine-room-update"));
    }

    // ── Cycle 3: EventEmitter::new() defaults ──────────────

    #[test]
    fn new_emitter_has_no_pending_events() {
        let e = EventEmitter::new();
        assert_eq!(e.pending_count(), 0);
    }

    #[test]
    fn new_emitter_should_flush_is_false_initially() {
        let e = EventEmitter::new();
        // Just created → interval not elapsed yet
        assert!(!e.should_flush());
    }

    // ── Cycle 4: with_config custom values ──────────────────

    #[test]
    fn with_config_accepts_custom_batch_interval() {
        let e = EventEmitter::with_config(100, 30);
        assert_eq!(e.pending_count(), 0);
        assert!(!e.should_flush()); // 0ms < 100ms
    }

    // ── Cycle 5: emit() queues events ──────────────────────

    #[test]
    fn emit_adds_event_to_pending_buffer() {
        let mut e = EventEmitter::new();
        e.emit("execution-update", serde_json::json!({"t": 1})).unwrap();
        assert_eq!(e.pending_count(), 1);
        e.emit("execution-update", serde_json::json!({"t": 2})).unwrap();
        assert_eq!(e.pending_count(), 2);
    }

    #[test]
    fn emit_increments_channel_counter() {
        let mut e = EventEmitter::with_config(50, 10);
        e.emit("ch", serde_json::json!({})).unwrap();
        assert_eq!(e.channel_count("ch"), 1);
        e.emit("ch", serde_json::json!({})).unwrap();
        assert_eq!(e.channel_count("ch"), 2);
    }

    #[test]
    fn emit_different_channels_have_independent_counters() {
        let mut e = EventEmitter::with_config(50, 5);
        e.emit("a", serde_json::json!({})).unwrap();
        e.emit("b", serde_json::json!({})).unwrap();
        e.emit("a", serde_json::json!({})).unwrap();
        assert_eq!(e.channel_count("a"), 2);
        assert_eq!(e.channel_count("b"), 1);
    }

    // ── Cycle 6: rate limiting ─────────────────────────────

    #[test]
    fn emit_returns_error_when_rate_limit_exceeded() {
        let mut e = EventEmitter::with_config(50, 2); // max 2/sec
        e.emit("ch", serde_json::json!({})).unwrap();  // #1 — ok
        e.emit("ch", serde_json::json!({})).unwrap();  // #2 — ok
        match e.emit("ch", serde_json::json!({})).unwrap_err() {
            EmitError::RateLimited { channel, max } => {
                assert_eq!(channel, "ch");
                assert_eq!(max, 2);
            }
            other => panic!("expected RateLimited, got: {:?}", other),
        }
        // The rejected event should NOT be in pending
        assert_eq!(e.pending_count(), 2);
    }

    #[test]
    fn rate_limit_does_not_affect_other_channels() {
        let mut e = EventEmitter::with_config(50, 1);
        e.emit("a", serde_json::json!({})).unwrap();  // ok
        e.emit("a", serde_json::json!({})).unwrap_err(); // rate limited
        // Channel b should still accept events
        e.emit("b", serde_json::json!({})).unwrap();  // ok
        assert_eq!(e.channel_count("b"), 1);
    }

    // ── Cycle 7: flush() drains buffer ─────────────────────

    #[test]
    fn flush_drains_all_pending_events() {
        let mut e = EventEmitter::new();
        e.emit("ch", serde_json::json!({"id": 1})).unwrap();
        e.emit("ch", serde_json::json!({"id": 2})).unwrap();
        e.emit("ch", serde_json::json!({"id": 3})).unwrap();
        assert_eq!(e.pending_count(), 3);

        let drained = e.flush();
        assert_eq!(drained.len(), 3);
        assert_eq!(e.pending_count(), 0);
    }

    #[test]
    fn flush_returns_events_in_order() {
        let mut e = EventEmitter::new();
        e.emit("ch", serde_json::json!({"seq": 1})).unwrap();
        e.emit("ch", serde_json::json!({"seq": 2})).unwrap();
        let drained = e.flush();
        assert_eq!(drained[0].payload["seq"], 1);
        assert_eq!(drained[1].payload["seq"], 2);
    }

    #[test]
    fn flush_on_empty_returns_empty_vec() {
        let mut e = EventEmitter::new();
        assert!(e.flush().is_empty());
        assert_eq!(e.pending_count(), 0);
    }

    // ── Cycle 8: should_flush timing ───────────────────────

    #[test]
    fn should_flush_false_before_interval_elapses() {
        let e = EventEmitter::with_config(5000, 60); // 5s interval
        assert!(!e.should_flush());
    }

    #[test]
    fn should_flush_true_after_interval_elapses() {
        use std::thread;
        let e = EventEmitter::with_config(5, 60); // 5ms interval
        thread::sleep(std::time::Duration::from_millis(10));
        assert!(e.should_flush());
    }

    #[test]
    fn should_flush_resets_after_flush_call() {
        use std::thread;
        let mut e = EventEmitter::with_config(5, 60);
        thread::sleep(std::time::Duration::from_millis(10));
        assert!(e.should_flush());
        e.flush(); // resets timer
        assert!(!e.should_flush());
    }

    // ── Cycle 9: rate limit counter reset after 1 second ───

    #[test]
    fn rate_limit_counter_resets_after_one_second_window() {
        use std::thread;
        let mut e = EventEmitter::with_config(50, 2); // max 2/sec
        e.emit("ch", serde_json::json!({})).unwrap(); // #1
        e.emit("ch", serde_json::json!({})).unwrap(); // #2
        e.emit("ch", serde_json::json!({})).unwrap_err(); // #3 — limited

        // Wait for rate window to expire (>1s)
        thread::sleep(std::time::Duration::from_millis(1100));

        // Should be able to emit again — counter was reset
        e.emit("ch", serde_json::json!({})).unwrap(); // new #1
        assert_eq!(e.channel_count("ch"), 1);
        assert_eq!(e.pending_count(), 3); // original 2 + new 1
    }

    // ── Cycle 10-11: StateChange mapping ────────────────────

    #[test]
    fn map_status_changed_goes_to_execution_update() {
        let pairs = map_state_change(
            "s1",
            &crate::pi_state::StateChange::SessionStatusChanged(crate::pi_state::LiveState::Thinking),
        );
        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0, "execution-update");
        assert_eq!(pairs[0].1["type"], "status_changed");
        assert_eq!(pairs[0].1["status"], "Thinking");
        assert_eq!(pairs[0].1["sessionId"], "s1");
    }

    #[test]
    fn map_new_turn_includes_turn_id() {
        let pairs = map_state_change("s2", &crate::pi_state::StateChange::NewTurn(5));
        assert_eq!(pairs[0].0, "execution-update");
        assert_eq!(pairs[0].1["turnId"], 5);
    }

    #[test]
    fn map_metrics_updated_goes_to_both_execution_and_engine_room() {
        let pairs = map_state_change("s3", &crate::pi_state::StateChange::MetricsUpdated);
        assert_eq!(pairs.len(), 2);
        let channels: Vec<&str> = pairs.iter().map(|(c, _)| c.as_str()).collect();
        assert!(channels.contains(&"execution-update"));
        assert!(channels.contains(&"engine-room-update"));
    }

    #[test]
    fn map_new_tool_call_includes_tool_id() {
        let pairs = map_state_change(
            "s4",
            &crate::pi_state::StateChange::NewToolCall { turn_id: 2, tool_id: "tc-99".to_string() },
        );
        assert_eq!(pairs[0].0, "execution-update");
        assert_eq!(pairs[0].1["toolId"], "tc-99");
        assert_eq!(pairs[0].1["turnId"], 2);
    }

    // ── Cycle 12: Integration — rapid emit + flush cycle ───

    #[test]
    fn rapid_emit_and_flush_cycle_processes_all_events() {
        let mut e = EventEmitter::with_config(5, 100); // 5ms batch, high rate limit

        for i in 0..20u32 {
            e.emit("execution-update", serde_json::json!({"seq": i})).unwrap();
        }
        assert_eq!(e.pending_count(), 20);

        // Wait for batch interval
        use std::thread;
        thread::sleep(std::time::Duration::from_millis(10));
        assert!(e.should_flush());

        let flushed = e.flush();
        assert_eq!(flushed.len(), 20);
        assert_eq!(e.pending_count(), 0);

        // Verify ordering preserved
        for (i, ev) in flushed.iter().enumerate() {
            assert_eq!(ev.payload["seq"], i as u32);
        }
    }

    #[test]
    fn emit_after_flush_continues_normally() {
        use std::thread;
        let mut e = EventEmitter::with_config(5, 100);

        e.emit("ch", serde_json::json!({"a": 1})).unwrap();
        thread::sleep(std::time::Duration::from_millis(10));
        e.flush();

        e.emit("ch", serde_json::json!({"b": 2})).unwrap();
        assert_eq!(e.pending_count(), 1);
        let flushed = e.flush(); // flush even before interval — OK, just drains
        assert_eq!(flushed.len(), 1);
        assert_eq!(flushed[0].payload["b"], 2);
    }

    // ── Cycle 13: Default impl ─────────────────────────────

    #[test]
    fn default_emitter_matches_new() {
        let a = EventEmitter::default();
        let b = EventEmitter::new();
        assert_eq!(a.pending_count(), b.pending_count());
        assert_eq!(a.should_flush(), b.should_flush());
    }
}
