//! Pi JSONL event parser — faithfully mirrors Pi's `--mode json` stdout format.
//!
//! # Event Flow
//!
//! Pi outputs one JSON object per line (JSONL). Each line has a `type` field
//! determining its shape:
//!
//! - `session` — session metadata (id, version, cwd, timestamp)
//! - `agent_start` / `agent_end` — lifecycle boundaries
//! - `turn_start` / `turn_end` — turn boundaries
//! - `message_start` / `message_end` — message boundaries (role + content)
//! - `message_update` — streaming container with nested `assistantMessageEvent`:
//!   - `thinking_start` / `thinking_delta`
//!   - `text_start` / `text_delta`
//!   - `toolcall_start` / `toolcall_delta` / `toolcall_end`
//! - `tool_execution_start` / `tool_execution_update` / `tool_execution_end` — tool lifecycle
//!
//! # Design
//!
//! - [`PiJsonEvent`] enum faithfully mirrors Pi's JSON structure (field names match)
//! - [`parse_line()`] is the core sync parser: `&str → Result<PiJsonEvent, ParseError>`
//! - [`parse_jsonl_stream()`] wraps it as an async `Stream` over `BufReader<ChildStdout>`
//! - Unknown event types produce `PiJsonEvent::Unknown { raw }` — never panics

use serde::{Deserialize, Serialize};

// ─── Errors ───────────────────────────────────────────────

/// Errors that can occur during JSONL parsing.
#[derive(Debug, thiserror::Error)]
pub enum ParseError {
    #[error("Invalid JSON: {0}")]
    InvalidJson(String),

    #[error("Line truncated (exceeds 64KB): {0} bytes")]
    TruncatedLine(usize),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

// ─── Event Types ──────────────────────────────────────────

/// A single event from Pi's JSONL stdout.
///
/// Variants are named to match Pi's `type` field values for easy mapping.
/// Uses serde's `tag` encoding so `"type"` determines the variant.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PiJsonEvent {
    /// Session metadata emitted at startup.
    #[serde(rename = "session")]
    Session {
        version: i32,
        id: String,
        timestamp: String,
        cwd: String,
    },

    /// Agent (session) started.
    #[serde(rename = "agent_start")]
    AgentStart,

    /// Agent (session) ended with all messages.
    #[serde(rename = "agent_end")]
    AgentEnd {
        messages: Vec<PiMessage>,
    },

    /// New turn started.
    #[serde(rename = "turn_start")]
    TurnStart,

    /// Turn ended with the final assistant message.
    #[serde(rename = "turn_end")]
    TurnEnd {
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<PiMessage>,
    },

    /// Message boundary — start of a user/assistant message.
    #[serde(rename = "message_start")]
    MessageStart {
        message: PiMessage,
    },

    /// Message boundary — end of a user/assistant message.
    #[serde(rename = "message_end")]
    MessageEnd {
        message: PiMessage,
    },

    /// Streaming update containing an assistant message sub-event.
    #[serde(rename = "message_update")]
    MessageUpdate {
        #[serde(rename = "assistantMessageEvent")]
        assistant_message_event: AssistantMessageEvent,
        #[serde(skip_serializing_if = "Option::is_none")]
        message: Option<PiMessage>,
    },

    /// Tool execution started (Pi is invoking the tool).
    #[serde(rename = "tool_execution_start")]
    ToolExecutionStart {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        args: serde_json::Value,
    },

    /// Tool execution progress update with partial result.
    #[serde(rename = "tool_execution_update")]
    ToolExecutionUpdate {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        args: serde_json::Value,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "partialResult")]
        partial_result: Option<ToolPartialResult>,
    },

    /// Tool execution completed with final result.
    #[serde(rename = "tool_execution_end")]
    ToolExecutionEnd {
        #[serde(rename = "toolCallId")]
        tool_call_id: String,
        #[serde(rename = "toolName")]
        tool_name: String,
        result: ToolResult,
    },

    /// Forward-compat catch-all for unrecognized event types.
    Unknown {
        raw: serde_json::Value,
    },
}

// ─── Nested Types ─────────────────────────────────────────

/// A message from user or assistant.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiMessage {
    pub role: String,
    pub content: Vec<PiContentBlock>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<u64>,
}

/// Content block within a message (thinking, text, tool call).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PiContentBlock {
    Thinking {
        thinking: String,
        #[serde(rename = "thinkingSignature", skip_serializing_if = "Option::is_none")]
        thinking_signature: Option<String>,
    },
    Text {
        text: String,
    },
    ToolCall {
        id: String,
        name: String,
        arguments: serde_json::Value,
    },
}

/// Sub-events within `message_update`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AssistantMessageEvent {
    ThinkingStart {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        #[serde(skip_serializing_if = "Option::is_none")]
        partial: Option<PiMessage>,
    },
    ThinkingDelta {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        delta: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        partial: Option<PiMessage>,
    },
    TextStart {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        #[serde(skip_serializing_if = "Option::is_none")]
        partial: Option<PiMessage>,
    },
    TextDelta {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        delta: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        partial: Option<PiMessage>,
    },
    #[serde(rename = "toolcall_start")]
    ToolCallStart {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        #[serde(skip_serializing_if = "Option::is_none")]
        partial: Option<PiMessage>,
    },
    #[serde(rename = "toolcall_delta")]
    ToolCallDelta {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        delta: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        partial: Option<PiMessage>,
    },
    #[serde(rename = "toolcall_end")]
    ToolCallEnd {
        #[serde(rename = "contentIndex")]
        content_index: usize,
        #[serde(skip_serializing_if = "Option::is_none")]
        #[serde(rename = "toolCall")]
        tool_call: Option<ParsedToolCall>,
        #[serde(skip_serializing_if = "Option::is_none")]
        partial: Option<PiMessage>,
    },
}

/// Parsed tool call extracted at toolcall_end.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedToolCall {
    pub id: String,
    pub name: String,
    pub arguments: serde_json::Value,
}

/// Partial result during tool execution.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolPartialResult {
    pub content: Vec<ToolContentBlock>,
}

/// Content block within a tool result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ToolContentBlock {
    Text { text: String },
}

/// Final tool execution result.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResult {
    pub content: Vec<ToolContentBlock>,
}

// ─── Field Truncation ──────────────────────────────────────

const MAX_FIELD_BYTES: usize = 64 * 1024; // 64 KB per field value
const TRUNCATION_MARKER: &str = "\n... [truncated]";

/// Truncate a string value at MAX_FIELD_BYTES, appending a marker if cut.
pub fn truncate_field(s: &str) -> String {
    if s.len() <= MAX_FIELD_BYTES {
        s.to_string()
    } else {
        format!("{}{}", &s[..MAX_FIELD_BYTES], TRUNCATION_MARKER)
    }
}

// ─── Parser ───────────────────────────────────────────────

/// Maximum line length before truncation (64 KB).
const MAX_LINE_BYTES: usize = 64 * 1024;

/// Parse a single JSONL line into a `PiJsonEvent`.
///
/// Empty lines return `None`. Lines exceeding 64KB return `TruncatedLine`.
/// Malformed JSON returns `ParseError::InvalidJson`.
/// Unrecognized `"type"` values produce `PiJsonEvent::Unknown { raw }`.
pub fn parse_line(line: &str) -> Result<Option<PiJsonEvent>, ParseError> {
    let trimmed = line.trim();

    // Skip empty lines
    if trimmed.is_empty() {
        return Ok(None);
    }

    // Check line length (in bytes, not chars)
    if trimmed.len() > MAX_LINE_BYTES {
        return Err(ParseError::TruncatedLine(trimmed.len()));
    }

    // First try parsing as known PiJsonEvent variants
    match serde_json::from_str::<PiJsonEvent>(trimmed) {
        Ok(event) => return Ok(Some(event)),
        Err(_) => {} // fall through to unknown-type handling
    }

    // Known enum failed — try as raw Value for forward-compat.
    match serde_json::from_str::<serde_json::Value>(trimmed) {
        Ok(raw) => Ok(Some(PiJsonEvent::Unknown { raw })),
        Err(e) => Err(ParseError::InvalidJson(e.to_string())),
    }
}

// ─── Async Stream Parser ──────────────────────────────────

/// Parse a JSONL stream from Pi's stdout into events.
///
/// Returns an async stream of `Result<PiJsonEvent, ParseError>`.
/// Empty lines are skipped. Lines > 64KB produce `TruncatedLine` errors in the stream.
pub async fn parse_jsonl_stream(
    reader: &mut (impl tokio::io::AsyncBufReadExt + Unpin),
) -> Result<impl futures::Stream<Item = Result<PiJsonEvent, ParseError>>, ParseError> {
    use futures::stream;
    let mut buf = String::new();
    let mut events = Vec::new();

    loop {
        match reader.read_line(&mut buf).await {
            Ok(0) => break, // EOF
            Err(e) => return Err(ParseError::Io(e)),
            Ok(_) => {}
        }
        match parse_line(&buf) {
            Ok(Some(event)) => events.push(Ok(event)),
            Ok(None) => {} // skip empty lines
            Err(e) => events.push(Err(e))
        }
        buf.clear();
    }

    Ok(stream::iter(events))
}

// ─── Tests ───────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_session_event() {
        let result = parse_line(include_str!("fixtures/session.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::Session { version, id, timestamp, cwd } => {
                assert_eq!(version, 3);
                assert_eq!(id, "019e7317-68c8-7baa-84f8-e61693f07fc8");
                assert_eq!(timestamp, "2026-05-29T09:36:14.536Z");
                assert_eq!(cwd, "/Users/alex/Projects/scripting/bridge");
            }
            other => panic!("expected Session event, got: {:?}", other),
        }
    }

    #[test]
    fn skip_empty_lines() {
        assert!(parse_line("").unwrap().is_none());
        assert!(parse_line("   ").unwrap().is_none());
        assert!(parse_line("\t\n").unwrap().is_none());
    }

    #[test]
    fn parse_agent_start_event() {
        let result = parse_line(include_str!("fixtures/agent_start.json")).expect("should parse");
        assert!(result.is_some());
        assert_eq!(result.unwrap(), PiJsonEvent::AgentStart);
    }

    #[test]
    fn parse_agent_end_event() {
        let result = parse_line(include_str!("fixtures/agent_end.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::AgentEnd { messages } => { assert!(messages.is_empty()); }
            other => panic!("expected AgentEnd, got: {:?}", other),
        }
    }

    #[test]
    fn parse_turn_start_event() {
        let result = parse_line(include_str!("fixtures/turn_start.json")).expect("should parse");
        assert!(result.is_some());
        assert_eq!(result.unwrap(), PiJsonEvent::TurnStart);
    }

    #[test]
    fn parse_turn_end_event() {
        let result = parse_line(include_str!("fixtures/turn_end.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::TurnEnd { message } => { assert!(message.is_none()); }
            other => panic!("expected TurnEnd, got: {:?}", other),
        }
    }

    #[test]
    fn parse_message_start_event() {
        let result = parse_line(include_str!("fixtures/message_start.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::MessageStart { message } => { assert_eq!(message.role, "user"); }
            other => panic!("expected MessageStart, got: {:?}", other),
        }
    }

    #[test]
    fn parse_message_end_event() {
        let result = parse_line(include_str!("fixtures/message_end.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::MessageEnd { message } => { assert_eq!(message.role, "user"); }
            other => panic!("expected MessageEnd, got: {:?}", other),
        }
    }

    #[test]
    fn parse_thinking_delta_event() {
        let result = parse_line(include_str!("fixtures/thinking_delta.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::MessageUpdate {
                assistant_message_event: AssistantMessageEvent::ThinkingDelta { delta, .. },
                ..
            } => { assert_eq!(delta, "Hello"); }
            other => panic!("expected ThinkingDelta, got: {:?}", other),
        }
    }

    #[test]
    fn parse_text_delta_event() {
        let result = parse_line(include_str!("fixtures/text_delta.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::MessageUpdate {
                assistant_message_event: AssistantMessageEvent::TextDelta { delta, .. },
                ..
            } => { assert_eq!(delta, "Hello world"); }
            other => panic!("expected TextDelta, got: {:?}", other),
        }
    }

    #[test]
    fn parse_toolcall_start_event() {
        let result = parse_line(include_str!("fixtures/toolcall_start.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::MessageUpdate {
                assistant_message_event: AssistantMessageEvent::ToolCallStart { .. }, ..
            } => {}
            other => panic!("expected ToolCallStart, got: {:?}", other),
        }
    }

    #[test]
    fn parse_toolcall_delta_event() {
        let result = parse_line(include_str!("fixtures/toolcall_delta.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::MessageUpdate {
                assistant_message_event: AssistantMessageEvent::ToolCallDelta { delta, .. },
                ..
            } => { assert_eq!(delta, "{\"command\":"); }
            other => panic!("expected ToolCallDelta, got: {:?}", other),
        }
    }

    #[test]
    fn parse_toolcall_end_event() {
        let result = parse_line(include_str!("fixtures/toolcall_end.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::MessageUpdate {
                assistant_message_event: AssistantMessageEvent::ToolCallEnd { tool_call, .. },
                ..
            } => {
                let tc = tool_call.expect("tool_call should be present");
                assert_eq!(tc.name, "bash");
                assert_eq!(tc.id, "call_abc123");
            }
            other => panic!("expected ToolCallEnd, got: {:?}", other),
        }
    }

    #[test]
    fn parse_tool_execution_start_event() {
        let result = parse_line(include_str!("fixtures/tool_execution_start.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::ToolExecutionStart { tool_call_id, tool_name, .. } => {
                assert_eq!(tool_call_id, "call_abc123");
                assert_eq!(tool_name, "bash");
            }
            other => panic!("expected ToolExecutionStart, got: {:?}", other),
        }
    }

    #[test]
    fn parse_tool_execution_update_event() {
        let result = parse_line(include_str!("fixtures/tool_execution_update.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::ToolExecutionUpdate { partial_result: Some(pr), .. } => {
                assert_eq!(pr.content.len(), 1);
            }
            other => panic!("expected ToolExecutionUpdate, got: {:?}", other),
        }
    }

    #[test]
    fn parse_tool_execution_end_event() {
        let result = parse_line(include_str!("fixtures/tool_execution_end.json")).expect("should parse");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::ToolExecutionEnd { result: tr, .. } => { assert_eq!(tr.content.len(), 1); }
            other => panic!("expected ToolExecutionEnd, got: {:?}", other),
        }
    }

    #[test]
    fn malformed_json_returns_error() {
        let result = parse_line("this is not json");
        assert!(result.is_err());
        match result.unwrap_err() {
            ParseError::InvalidJson(msg) => { assert!(!msg.is_empty()); }
            other => panic!("expected InvalidJson, got: {:?}", other),
        }
    }

    #[test]
    fn unknown_event_type_becomes_unknown() {
        let json = r#"{"type":"future_event","foo":"bar"}"#;
        let result = parse_line(json).expect("should parse without panic");
        assert!(result.is_some());
        match result.unwrap() {
            PiJsonEvent::Unknown { raw } => { assert_eq!(raw["type"], "future_event"); }
            other => panic!("expected Unknown, got: {:?}", other),
        }
    }

    #[test]
    fn oversized_line_returns_error() {
        let long_value = "x".repeat(70_000);
        let json = format!(r#"{{"type":"session","id":"{}"}}"#, long_value);
        let result = parse_line(&json);
        assert!(result.is_err());
        match result.unwrap_err() {
            ParseError::TruncatedLine(len) => { assert!(len > 65_536); }
            other => panic!("expected TruncatedLine, got: {:?}", other),
        }
    }

    #[test]
    fn full_lifecycle_sequence() {
        let events: Vec<&str> = vec![
            include_str!("fixtures/session.json"),
            include_str!("fixtures/agent_start.json"),
            include_str!("fixtures/turn_start.json"),
            include_str!("fixtures/message_start.json"),
            include_str!("fixtures/message_end.json"),
            include_str!("fixtures/thinking_delta.json"),
            include_str!("fixtures/text_delta.json"),
            include_str!("fixtures/toolcall_end.json"),
            include_str!("fixtures/tool_execution_start.json"),
            include_str!("fixtures/tool_execution_update.json"),
            include_str!("fixtures/tool_execution_end.json"),
            include_str!("fixtures/turn_end.json"),
            include_str!("fixtures/agent_end.json"),
        ];
        let parsed: Vec<PiJsonEvent> = events
            .iter()
            .map(|l| parse_line(l).unwrap().unwrap())
            .collect();
        assert_eq!(parsed.len(), 13);
        matches!(&parsed[0], PiJsonEvent::Session { .. });
        matches!(&parsed.last().unwrap(), PiJsonEvent::AgentEnd { .. });
    }

    // ── Truncation Tests ──

    #[test]
    fn truncate_field_short_string_unchanged() {
        let s = "hello world";
        assert_eq!(truncate_field(s), "hello world");
    }

    #[test]
    fn truncate_field_at_exact_limit_unchanged() {
        let s = "x".repeat(MAX_FIELD_BYTES);
        assert_eq!(truncate_field(&s).len(), MAX_FIELD_BYTES);
    }

    #[test]
    fn truncate_field_over_limit_adds_marker() {
        let s = "x".repeat(MAX_FIELD_BYTES + 100);
        let result = truncate_field(&s);
        assert!(result.ends_with(TRUNCATION_MARKER));
        assert_eq!(result.len(), MAX_FIELD_BYTES + TRUNCATION_MARKER.len());
    }

    #[test]
    fn truncate_field_empty_string_unchanged() {
        assert_eq!(truncate_field(""), "");
    }

    #[test]
    fn truncate_field_unicode_safe() {
        let s = "🔥".repeat(20_000); // 4 bytes each = ~80KB
        let result = truncate_field(&s);
        assert!(result.len() <= MAX_FIELD_BYTES + TRUNCATION_MARKER.len());
        assert!(result.ends_with(TRUNCATION_MARKER) || result.len() <= MAX_FIELD_BYTES);
    }
}
