/// TurnCard — collapsible card per conversation turn.
///
/// Header: role icon + turn index + metrics summary.
/// Body: user prompt text, ThinkingBubble slot, ToolCallCard list,
///       ResponseText slot. Click header to expand/collapse.

import type { Component } from "solid-js";
import type { TurnViewModel } from "../../lib/execution-types";
import { ThinkingBubble } from "./ThinkingBubble";
import { ResponseText } from "./ResponseText";
import { ToolCallCard } from "./ToolCallCard";
import { TurnMetricsBar } from "./TurnMetricsBar";
import { TruncatedText } from "./TruncatedText";

export interface TurnCardProps extends TurnViewModel {
  onToggleCollapse?: () => void;
  onToggleThinking?: () => void;
  onToggleToolCall?: (toolCallId: string) => void;
}

// ─── Role Icon ───────────────────────────────────────────────

function roleIcon(role: string): string {
  switch (role) {
    case "user": return "👤";
    case "assistant": return "🤖";
    case "system": return "⚙️";
    default: return "💬";
  }
}

// ─── Component ───────────────────────────────────────────────

export const TurnCard: Component<TurnCardProps> = (props) => {
  const hasThinking = () => props.thinkingText.length > 0;
  const hasToolCalls = () => props.toolCalls.length > 0;

  return (
    <div
      class={`turn-card ${props.isCollapsed ? "turn-card--collapsed" : ""}`}
      data-testid="turn-card"
      data-turn-id={props.id}
    >
      {/* Header — always visible */}
      <button
        class="turn-card__header"
        onClick={props.onToggleCollapse}
        aria-expanded={!props.isCollapsed}
        aria-label={`Turn ${props.id + 1}: ${props.role}`}
        type="button"
      >
        <span class="turn-card__role" aria-hidden="true">
          {roleIcon(props.role)}
        </span>
        <span class="turn-card__index">Turn {props.id + 1}</span>
        <span class="turn-card__summary">
          {props.metrics.tokensUsed > 0 && `${props.metrics.tokensUsed} tokens`}
          {props.toolCalls.length > 0 && ` · ${props.toolCalls.length} tools`}
        </span>
        <span class="turn-card__chevron" aria-hidden="true">
          {props.isCollapsed ? "▶" : "▼"}
        </span>
      </button>

      {/* Body — hidden when collapsed */}
      {!props.isCollapsed && (
        <div class="turn-card__body">
          {/* User prompt */}
          {props.promptText && (
            <div class="turn-card__prompt" data-testid="turn-prompt">
              <TruncatedText text={props.promptText} />
            </div>
          )}

          {/* Thinking */}
          {hasThinking() && (
            <ThinkingBubble
              text={props.thinkingText}
              isCollapsed={false}
              onToggle={props.onToggleThinking}
            />
          )}

          {/* Tool calls */}
          {hasToolCalls() && (
            <div class="turn-card__tools" data-testid="turn-tool-calls">
              {props.toolCalls.map((tc) => (
                <ToolCallCard
                  key={tc.id}
                  {...tc}
                  onToggleVisibility={() => props.onToggleToolCall?.(tc.id)}
                />
              ))}
            </div>
          )}

          {/* Response text */}
          {props.responseText && (
            <ResponseText text={
              <TruncatedText text={props.responseText} />
            } />
          )}

          {/* Metrics bar */}
          <TurnMetricsBar metrics={props.metrics} />
        </div>
      )}
    </div>
  );
};
