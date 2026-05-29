//! Pi execution state machine — applies events to produce view models.
//!
//! This module is a pure state reducer: given an [`ExecutionViewModel`] and a
//! [`PiJsonEvent`], [`apply_event()`] produces updated state + a list of
//! [`StateChange`] notifications.
//!
//! # State Machine
//!
//! ```text
//! Queued → Starting → Idle → Thinking → RunningTool ↔ StreamingText → Done
//!                                                       ↓               ↓
//!                                                    Error          Stopped
//! ```

use crate::pi_event::{PiJsonEvent, PiMessage, PiContentBlock, AssistantMessageEvent, ParsedToolCall, ToolResult, ToolContentBlock};
use serde::{Deserialize, Serialize};

// ─── View Model Types ─────────────────────────────────────

/// Status of a live Pi session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum LiveState {
    Queued,
    Starting,
    Idle,
    Thinking,
    RunningTool,
    StreamingText,
    Done,
    Error,
    Stopped,
}

impl Default for LiveState {
    fn default() -> Self { LiveState::Queued }
}

/// Metrics accumulated per turn or session.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnMetrics {
    pub tokens_used: u64,
    pub cost_usd: f64,
    pub tool_call_count: u32,
    pub duration_ms: u64,
}

/// Lifecycle status of a tool call.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ToolCallStatus {
    Invoking,
    Streaming,
    AwaitingResult,
    Completed,
    Failed,
}

/// A tool call within a turn, as seen in the execution view.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallViewModel {
    pub id: String,
    pub tool_name: String,
    pub target: String,
    pub arguments: serde_json::Value,
    pub status: ToolCallStatus,
    pub duration_ms: u64,
    pub result_preview: String,
    pub raw_result: Option<serde_json::Value>,
}

/// A single conversation turn (user prompt → assistant response).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnViewModel {
    pub id: usize,
    pub role: String,
    pub prompt_text: String,
    pub thinking_text: String,
    pub response_text: String,
    pub tool_calls: Vec<ToolCallViewModel>,
    pub metrics: TurnMetrics,
    pub is_collapsed: bool,
}

/// Top-level view model for a Pi execution session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionViewModel {
    pub session_id: String,
    pub model_name: String,
    pub provider: String,
    pub thinking_level: String,
    pub status: LiveState,
    pub started_at: Option<String>,
    pub elapsed_ms: u64,
    pub total_tokens: u64,
    pub total_cost: f64,
    pub turns: Vec<TurnViewModel>,
}

impl Default for ExecutionViewModel {
    fn default() -> Self {
        ExecutionViewModel {
            session_id: String::new(),
            model_name: String::new(),
            provider: String::new(),
            thinking_level: String::new(),
            status: LiveState::Queued,
            started_at: None,
            elapsed_ms: 0,
            total_tokens: 0,
            total_cost: 0.0,
            turns: Vec::new(),
        }
    }
}

// ─── State Changes ────────────────────────────────────────

/// Notifications emitted by [`apply_event`].
#[derive(Debug, Clone, PartialEq)]
pub enum StateChange {
    NewTurn(usize),
    TurnUpdated(usize),
    NewToolCall { turn_id: usize, tool_id: String },
    ToolCallUpdated { turn_id: usize, tool_id: String },
    SessionStatusChanged(LiveState),
    MetricsUpdated,
}

// ─── State Reducer ────────────────────────────────────────

/// Apply a single event to the view model, mutating it in place and returning
/// a list of state changes that occurred.
pub fn apply_event(model: &mut ExecutionViewModel, event: &PiJsonEvent) -> Vec<StateChange> {
    let mut changes = Vec::new();

    match event {
        PiJsonEvent::Session { id, .. } => {
            if !id.is_empty() { model.session_id = id.clone(); }
            model.status = LiveState::Starting;
            changes.push(StateChange::SessionStatusChanged(LiveState::Starting));
        }

        PiJsonEvent::AgentStart => {
            if matches!(model.status, LiveState::Queued | LiveState::Starting) {
                model.status = LiveState::Idle;
                changes.push(StateChange::SessionStatusChanged(LiveState::Idle));
            }
        }

        PiJsonEvent::TurnStart => {
            let turn_id = model.turns.len();
            model.turns.push(TurnViewModel {
                id: turn_id,
                role: String::new(),
                prompt_text: String::new(),
                thinking_text: String::new(),
                response_text: String::new(),
                tool_calls: Vec::new(),
                metrics: TurnMetrics::default(),
                is_collapsed: false,
            });
            changes.push(StateChange::NewTurn(turn_id));
        }

        PiJsonEvent::MessageStart { message } => {
            if let Some(turn) = model.turns.last_mut() {
                if message.role == "user" {
                    turn.role = "user".to_string();
                    turn.prompt_text = crate::pi_event::truncate_field(&extract_text_content(&message.content));
                    changes.push(StateChange::TurnUpdated(turn.id));
                }
            }
        }

        PiJsonEvent::MessageEnd { .. } => {}

        PiJsonEvent::MessageUpdate { assistant_message_event, .. } => {
            match assistant_message_event {
                AssistantMessageEvent::ThinkingDelta { delta, .. } => {
                    if model.status != LiveState::Thinking {
                        model.status = LiveState::Thinking;
                        changes.push(StateChange::SessionStatusChanged(LiveState::Thinking));
                    }
                    if let Some(turn) = model.turns.last_mut() {
                        turn.thinking_text =
                            crate::pi_event::truncate_field(&(turn.thinking_text.clone() + delta));
                        changes.push(StateChange::TurnUpdated(turn.id));
                    }
                }
                AssistantMessageEvent::TextDelta { delta, .. } => {
                    if model.status != LiveState::StreamingText {
                        model.status = LiveState::StreamingText;
                        changes.push(StateChange::SessionStatusChanged(LiveState::StreamingText));
                    }
                    if let Some(turn) = model.turns.last_mut() {
                        turn.response_text =
                            crate::pi_event::truncate_field(&(turn.response_text.clone() + delta));
                        changes.push(StateChange::TurnUpdated(turn.id));
                    }
                }
                AssistantMessageEvent::ToolCallEnd { tool_call, .. } => {
                    if let (Some(turn), Some(tc)) = (model.turns.last_mut(), tool_call) {
                        turn.tool_calls.push(ToolCallViewModel {
                            id: tc.id.clone(),
                            tool_name: tc.name.clone(),
                            target: String::new(),
                            arguments: tc.arguments.clone(),
                            status: ToolCallStatus::Invoking,
                            duration_ms: 0,
                            result_preview: String::new(),
                            raw_result: None,
                        });
                        turn.metrics.tool_call_count += 1;
                        changes.push(StateChange::NewToolCall { turn_id: turn.id, tool_id: tc.id.clone() });
                    }
                    if model.status != LiveState::RunningTool {
                        model.status = LiveState::RunningTool;
                        changes.push(StateChange::SessionStatusChanged(LiveState::RunningTool));
                    }
                }
                _ => {}
            }
        }

        PiJsonEvent::ToolExecutionStart { tool_call_id, .. } => {
            update_tool_call_status(&mut model.turns, |t| {
                if t.id == *tool_call_id { t.status = ToolCallStatus::Streaming; }
            });
        }

        PiJsonEvent::ToolExecutionUpdate { .. } => {}

        PiJsonEvent::ToolExecutionEnd { result, .. } => {
            update_tool_call_status(&mut model.turns, |t| {
                t.status = ToolCallStatus::Completed;
                t.result_preview = extract_tool_result_preview(result);
                t.raw_result = Some(serde_json::to_value(result).unwrap_or_default());
            });
            changes.push(StateChange::MetricsUpdated);
        }

        PiJsonEvent::TurnEnd { message } => {
            if let Some(msg) = message {
                if msg.role == "assistant" {
                    if let Some(turn) = model.turns.last_mut() {
                        turn.role = "assistant".to_string();
                    }
                }
            }
            changes.push(StateChange::MetricsUpdated);
        }

        PiJsonEvent::AgentEnd { messages } => {
            if let Some(last_msg) = messages.last() {
                if let Some(usage) = _extract_usage(last_msg) {
                    if let Some(turn) = model.turns.last_mut() {
                        turn.metrics.tokens_used = usage.0;
                        turn.metrics.cost_usd = usage.1;
                    }
                    model.total_tokens += usage.0;
                    model.total_cost += usage.1;
                }
            }
            model.status = LiveState::Done;
            changes.push(StateChange::SessionStatusChanged(LiveState::Done));
            changes.push(StateChange::MetricsUpdated);
        }

        PiJsonEvent::Unknown { .. } => {}
    }

    changes
}

// ─── Helpers ─────────────────────────────────────────────

fn extract_text_content(blocks: &[PiContentBlock]) -> String {
    blocks.iter().filter_map(|b| match b {
        PiContentBlock::Text { text } => Some(text.as_str()),
        _ => None,
    }).collect::<Vec<_>>().join("")
}

fn extract_tool_result_preview(result: &ToolResult) -> String {
    let text: String = result.content.iter().filter_map(|b| match b {
        ToolContentBlock::Text { text } => Some(text.as_str()),
    }).collect::<Vec<_>>().join("");
    crate::pi_event::truncate_field(&text.chars().take(200).collect::<String>())
}

fn _extract_usage(_message: &PiMessage) -> Option<(u64, f64)> {
    // TODO: Extract usage from message metadata when available
    None
}

fn update_tool_call_status<F>(turns: &mut [TurnViewModel], mut f: F)
where F: FnMut(&mut ToolCallViewModel)
{
    if let Some(turn) = turns.last_mut() {
        for tc in turn.tool_calls.iter_mut().rev() {
            if matches!(tc.status, ToolCallStatus::Completed | ToolCallStatus::Failed) { continue; }
            f(tc);
            return;
        }
    }
}

// ─── Crash Recovery ──────────────────────────────────────

/// Mark all incomplete tool calls as Failed and transition to Error state.
/// Call this when Pi process dies unexpectedly (crash, OOM, kill).
/// Returns the number of tool calls that were marked as failed.
pub fn crash_recovery(model: &mut ExecutionViewModel) -> usize {
    let mut failed_count = 0;
    for turn in model.turns.iter_mut() {
        for tc in turn.tool_calls.iter_mut() {
            match tc.status {
                ToolCallStatus::Invoking | ToolCallStatus::Streaming | ToolCallStatus::AwaitingResult => {
                    tc.status = ToolCallStatus::Failed;
                    tc.result_preview = "[Crashed — result unavailable]".to_string();
                    failed_count += 1;
                }
                _ => {}
            }
        }
    }
    // Only change status if we were in an active state
    if matches!(model.status, LiveState::Thinking | LiveState::RunningTool | LiveState::StreamingText | LiveState::Starting | LiveState::Idle) {
        model.status = LiveState::Error;
    }
    failed_count
}

// ─── Tests ───────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_model_defaults() {
        let m = ExecutionViewModel::default();
        assert_eq!(m.status, LiveState::Queued);
        assert!(m.session_id.is_empty());
        assert!(m.turns.is_empty());
    }

    #[test]
    fn session_start_sets_id_and_status() {
        let mut m = ExecutionViewModel::default();
        let ch = apply_event(&mut m, &PiJsonEvent::Session {
            version: 3, id: "sess-1".to_string(),
            timestamp: "2026-01-01T00:00:00Z".to_string(), cwd: "/tmp".to_string(),
        });
        assert_eq!(m.session_id, "sess-1");
        assert_eq!(m.status, LiveState::Starting);
        assert!(ch.contains(&StateChange::SessionStatusChanged(LiveState::Starting)));
    }

    #[test]
    fn agent_start_transitions_to_idle() {
        let mut m = ExecutionViewModel::default();
        m.status = LiveState::Starting;
        apply_event(&mut m, &PiJsonEvent::AgentStart);
        assert_eq!(m.status, LiveState::Idle);
    }

    #[test]
    fn turn_start_creates_new_turn() {
        let mut m = ExecutionViewModel::default();
        let ch = apply_event(&mut m, &PiJsonEvent::TurnStart);
        assert_eq!(m.turns.len(), 1);
        assert!(ch.contains(&StateChange::NewTurn(0)));
    }

    #[test]
    fn user_message_fills_prompt() {
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::TurnStart);
        let msg = PiMessage { role: "user".to_string(),
            content: vec![PiContentBlock::Text { text: "Hello".to_string() }],
            timestamp: Some(1234) };
        apply_event(&mut m, &PiJsonEvent::MessageStart { message: msg });
        assert_eq!(m.turns[0].prompt_text, "Hello");
    }

    #[test]
    fn thinking_delta_accumulates() {
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::TurnStart);
        apply_event(&mut m, &PiJsonEvent::MessageUpdate {
            assistant_message_event: AssistantMessageEvent::ThinkingDelta {
                content_index: 0, delta: "think".to_string(), partial: None },
            message: None });
        assert_eq!(m.status, LiveState::Thinking);
        assert_eq!(m.turns[0].thinking_text, "think");
    }

    #[test]
    fn text_delta_accumulates() {
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::TurnStart);
        apply_event(&mut m, &PiJsonEvent::MessageUpdate {
            assistant_message_event: AssistantMessageEvent::TextDelta {
                content_index: 1, delta: "hi".to_string(), partial: None },
            message: None });
        assert_eq!(m.status, LiveState::StreamingText);
        assert_eq!(m.turns[0].response_text, "hi");
    }

    #[test]
    fn tool_call_created_on_toolcall_end() {
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::TurnStart);
        let ev = PiJsonEvent::MessageUpdate {
            assistant_message_event: AssistantMessageEvent::ToolCallEnd {
                content_index: 1,
                tool_call: Some(ParsedToolCall { id: "c1".to_string(), name: "bash".to_string(),
                    arguments: serde_json::json!({"cmd": "ls"}) }),
                partial: None },
            message: None };
        apply_event(&mut m, &ev);
        assert_eq!(m.turns[0].tool_calls.len(), 1);
        assert_eq!(m.turns[0].tool_calls[0].tool_name, "bash");
        assert_eq!(m.status, LiveState::RunningTool);
    }

    #[test]
    fn agent_end_transitions_to_done() {
        let mut m = ExecutionViewModel::default();
        m.status = LiveState::StreamingText;
        let ch = apply_event(&mut m, &PiJsonEvent::AgentEnd { messages: vec![] });
        assert_eq!(m.status, LiveState::Done);
        assert!(ch.contains(&StateChange::SessionStatusChanged(LiveState::Done)));
    }

    #[test]
    fn full_happy_path_lifecycle() {
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::Session { version: 3, id: "s1".to_string(),
            timestamp: "2026-01-01T00:00:00Z".to_string(), cwd: "/tmp".to_string() });
        assert_eq!(m.status, LiveState::Starting);
        apply_event(&mut m, &PiJsonEvent::AgentStart);
        assert_eq!(m.status, LiveState::Idle);
        apply_event(&mut m, &PiJsonEvent::TurnStart);
        assert_eq!(m.turns.len(), 1);

        let user_msg = PiMessage { role: "user".to_string(),
            content: vec![PiContentBlock::Text { text: "Say hi".to_string() }], timestamp: Some(1000) };
        apply_event(&mut m, &PiJsonEvent::MessageStart { message: user_msg });
        assert_eq!(m.turns[0].prompt_text, "Say hi");

        apply_event(&mut m, &PiJsonEvent::MessageUpdate {
            assistant_message_event: AssistantMessageEvent::ThinkingDelta {
                content_index: 0, delta: "hmm".to_string(), partial: None }, message: None });
        assert_eq!(m.status, LiveState::Thinking);

        apply_event(&mut m, &PiJsonEvent::MessageUpdate {
            assistant_message_event: AssistantMessageEvent::TextDelta {
                content_index: 1, delta: "Hello!".to_string(), partial: None }, message: None });
        assert_eq!(m.status, LiveState::StreamingText);
        assert_eq!(m.turns[0].response_text, "Hello!");

        apply_event(&mut m, &PiJsonEvent::AgentEnd { messages: vec![] });
        assert_eq!(m.status, LiveState::Done);
        assert_eq!(m.session_id, "s1");
    }

    #[test]
    fn unknown_events_dont_panic_or_change_state() {
        let mut m = ExecutionViewModel::default();
        let ch = apply_event(&mut m, &PiJsonEvent::Unknown {
            raw: serde_json::json!({"type": "future", "data": [1,2,3]}) });
        assert!(ch.is_empty());
        assert_eq!(m.status, LiveState::Queued);
    }

    // ── Crash Recovery Tests ──

    #[test]
    fn crash_recovery_marks_incomplete_tools_as_failed() {
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::TurnStart);

        let ev = PiJsonEvent::MessageUpdate {
            assistant_message_event: AssistantMessageEvent::ToolCallEnd {
                content_index: 1,
                tool_call: Some(ParsedToolCall { id: "c1".to_string(), name: "bash".to_string(),
                    arguments: serde_json::json!({"cmd": "ls"}) }),
                partial: None }, message: None };
        apply_event(&mut m, &ev); // c1: Invoking

        let ev2 = PiJsonEvent::MessageUpdate {
            assistant_message_event: AssistantMessageEvent::ToolCallEnd {
                content_index: 1,
                tool_call: Some(ParsedToolCall { id: "c2".to_string(), name: "read".to_string(),
                    arguments: serde_json::json!({"path": "/tmp"}) }),
                partial: None }, message: None };
        apply_event(&mut m, &ev2); // c2: Invoking

        // Simulate one tool mid-execution before crash
        apply_event(&mut m, &PiJsonEvent::ToolExecutionStart {
            tool_call_id: "c1".to_string(), tool_name: "bash".to_string(),
            args: serde_json::json!({}) });

        let failed = crash_recovery(&mut m);
        assert_eq!(failed, 2);
        assert_eq!(m.turns[0].tool_calls[0].status, ToolCallStatus::Failed);
        assert_eq!(m.turns[0].tool_calls[1].status, ToolCallStatus::Failed);
        assert_eq!(m.status, LiveState::Error);
    }

    #[test]
    fn crash_recovery_skips_completed_tools() {
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::TurnStart);
        apply_event(&mut m, &PiJsonEvent::MessageUpdate {
            assistant_message_event: AssistantMessageEvent::ToolCallEnd {
                content_index: 1,
                tool_call: Some(ParsedToolCall { id: "c1".to_string(), name: "bash".to_string(),
                    arguments: serde_json::json!({}) }),
                partial: None }, message: None });
        apply_event(&mut m, &PiJsonEvent::ToolExecutionEnd {
            tool_call_id: "c1".to_string(), tool_name: "bash".to_string(),
            result: ToolResult { content: vec![ToolContentBlock::Text { text: "done".to_string() }] } });

        let failed = crash_recovery(&mut m);
        assert_eq!(failed, 0);
        assert_eq!(m.turns[0].tool_calls[0].status, ToolCallStatus::Completed);
    }

    // ── Stress Tests ──

    #[test]
    fn rapid_burst_150_events_processed_in_order() {
        use std::time::Instant;
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::Session { version: 3, id: "burst".to_string(),
            timestamp: "2026-01-01T00:00:00Z".to_string(), cwd: "/tmp".to_string() });
        apply_event(&mut m, &PiJsonEvent::AgentStart);
        apply_event(&mut m, &PiJsonEvent::TurnStart); // need a turn to accumulate into

        let start = Instant::now();

        for i in 0..150u32 {
            let ev = PiJsonEvent::MessageUpdate {
                assistant_message_event: AssistantMessageEvent::ThinkingDelta {
                    content_index: 0, delta: format!("token{} ", i), partial: None },
                message: None };
            apply_event(&mut m, &ev);
        }

        let elapsed = start.elapsed();
        assert_eq!(m.turns.len(), 1);
        assert!(m.turns[0].thinking_text.starts_with("token0 "));
        assert!(m.turns[0].thinking_text.contains("token149 "));
        assert!(elapsed.as_millis() < 100, "burst took {}ms", elapsed.as_millis());

        let tokens: Vec<&str> = m.turns[0].thinking_text.split_whitespace().collect();
        assert_eq!(tokens.len(), 150);
        for (i, token) in tokens.iter().enumerate() {
            assert_eq!(*token, format!("token{}", i));
        }
    }

    #[test]
    fn stress_150_turn_session_no_degradation() {
        use std::time::Instant;
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::Session { version: 3, id: "stress".to_string(),
            timestamp: "2026-01-01T00:00:00Z".to_string(), cwd: "/tmp".to_string() });
        apply_event(&mut m, &PiJsonEvent::AgentStart);

        let start = Instant::now();

        for i in 0..150usize {
            apply_event(&mut m, &PiJsonEvent::TurnStart);
            let user_msg = PiMessage { role: "user".to_string(),
                content: vec![PiContentBlock::Text { text: format!("Prompt {}", i) }], timestamp: Some(i as u64) };
            apply_event(&mut m, &PiJsonEvent::MessageStart { message: user_msg });
            apply_event(&mut m, &PiJsonEvent::MessageUpdate {
                assistant_message_event: AssistantMessageEvent::TextDelta {
                    content_index: 1, delta: format!("Response {}\n", i), partial: None },
                message: None });
            apply_event(&mut m, &PiJsonEvent::TurnEnd { message: None });
        }

        let elapsed = start.elapsed();
        assert_eq!(m.turns.len(), 150);
        assert_eq!(m.turns[0].prompt_text, "Prompt 0");
        assert_eq!(m.turns[0].response_text, "Response 0\n");
        assert_eq!(m.turns[149].prompt_text, "Prompt 149");
        assert_eq!(m.turns[149].response_text, "Response 149\n");
        assert!(elapsed.as_millis() < 200, "150 turns took {}ms", elapsed.as_millis());
    }

    // ── Truncation Integration Tests ──

    #[test]
    fn field_truncation_applied_to_long_thinking_text() {
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::TurnStart);
        let huge_delta = "x".repeat(70_000);
        let ev = PiJsonEvent::MessageUpdate {
            assistant_message_event: AssistantMessageEvent::ThinkingDelta {
                content_index: 0, delta: huge_delta, partial: None },
            message: None };
        apply_event(&mut m, &ev);
        assert!(m.turns[0].thinking_text.len() <= 64 * 1024 + 100);
        assert!(m.turns[0].thinking_text.contains("[truncated]"));
    }

    #[test]
    fn field_truncation_applied_to_long_response_text() {
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::TurnStart);
        let huge = "y".repeat(70_000);
        apply_event(&mut m, &PiJsonEvent::MessageUpdate {
            assistant_message_event: AssistantMessageEvent::TextDelta {
                content_index: 1, delta: huge, partial: None },
            message: None });
        assert!(m.turns[0].response_text.len() <= 64 * 1024 + 100);
        assert!(m.turns[0].response_text.contains("[truncated]"));
    }

    #[test]
    fn field_truncation_applied_to_long_prompt_text() {
        let mut m = ExecutionViewModel::default();
        apply_event(&mut m, &PiJsonEvent::TurnStart);
        let huge_prompt = "z".repeat(70_000);
        let msg = PiMessage { role: "user".to_string(),
            content: vec![PiContentBlock::Text { text: huge_prompt }],
            timestamp: Some(1) };
        apply_event(&mut m, &PiJsonEvent::MessageStart { message: msg });
        assert!(m.turns[0].prompt_text.len() <= 64 * 1024 + 100);
        assert!(m.turns[0].prompt_text.contains("[truncated]"));
    }
}
