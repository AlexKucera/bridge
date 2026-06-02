/// TurnCard — collapsible card per conversation turn.
///
/// Header: role icon + turn index + metrics summary.
/// Body: user prompt text, ThinkingBubble slot, ToolCallCard list,
///       ResponseText slot. Click header to expand/collapse.
///
/// Supports compact mode (header-only), custom font size,
/// and global thinking visibility toggle.

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
  /** Compact mode: collapse all turns to header-only (~60% height reduction). */
  compact?: boolean;
  /** Custom font size in pixels for execution view text. */
  fontSize?: number;
  /** Global toggle to hide/show all ThinkingBubbles across all turns. */
  showThinking?: boolean;
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
  /** Body is visible when not collapsed AND not in compact mode. */
  const bodyVisible = () => !props.isCollapsed && !props.compact;

  return (
    <div
      class={`turn-card${props.compact ? " turn-card--compact" : ""}${props.isCollapsed ? " turn-card--collapsed" : ""}`}
      style={props.fontSize ? { "--font-size": `${props.fontSize}px` } as CSSStyleDeclaration : undefined}
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
          {props.isCollapsed || props.compact ? "▶" : "▼"}
        </span>
      </button>

      {/* Body — hidden when collapsed OR compact */}
      {bodyVisible() && (
        <div class="turn-card__body">
          {/* User prompt */}
          {props.promptText && (
            <div class="turn-card__prompt" data-testid="turn-prompt">
              <TruncatedText text={props.promptText} />
            </div>
          )}

          {/* Thinking — controlled by global toggle */}
          {hasThinking() && props.showThinking !== false && (
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
