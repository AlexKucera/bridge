/// ToolCallCard — nested card showing a single tool invocation.
///
/// Renders tool name badge (color-coded by category), target/args preview,
/// status indicator (5 states), duration, collapsible result preview.
///
/// Active states (Invoking, Streaming) show a progress sweep animation
/// and spinner icon. Terminal transitions flash green (Completed) or
/// red (Failed).

import type { Component } from "solid-js";
import type { ToolCallViewModel } from "../../lib/execution-types";
import { ToolCallStatus } from "../../lib/execution-types";

export interface ToolCallCardProps extends ToolCallViewModel {
  onToggleVisibility?: () => void;
  isVisible?: boolean;
}

// ─── Status Config ───────────────────────────────────────────

interface StatusConfig {
  testId: string;
  label: string;
  icon: string;
}

function statusConfig(status: ToolCallStatus): StatusConfig {
  switch (status) {
    case ToolCallStatus.Invoking:
      return { testId: "tool-status-invoking", label: "Invoking", icon: "⏳" };
    case ToolCallStatus.Streaming:
      return { testId: "tool-status-streaming", label: "Streaming", icon: "🔄" };
    case ToolCallStatus.AwaitingResult:
      return { testId: "tool-status-awaiting", label: "Awaiting", icon: "⏳" };
    case ToolCallStatus.Completed:
      return { testId: "tool-status-completed", label: "Completed", icon: "✅" };
    case ToolCallStatus.Failed:
      return { testId: "tool-status-failed", label: "Failed", icon: "❌" };
  }
}

// ─── State Classification ────────────────────────────────────

const ACTIVE_TOOL_STATES = new Set<ToolCallStatus>([
  ToolCallStatus.Invoking,
  ToolCallStatus.Streaming,
]);

const TERMINAL_TOOL_STATES = new Set<ToolCallStatus>([
  ToolCallStatus.Completed,
  ToolCallStatus.Failed,
]);

export function isToolActive(status: ToolCallStatus): boolean {
  return ACTIVE_TOOL_STATES.has(status);
}

export function isToolTerminal(status: ToolCallStatus): boolean {
  return TERMINAL_TOOL_STATES.has(status);
}

// ─── CSS Class ───────────────────────────────────────────────

function cardClass(status: ToolCallStatus, category: string): string {
  const base = `tool-call ${category}`;
  if (isToolActive(status)) return `${base} tool-call--active`;
  if (status === ToolCallStatus.Completed) return `${base} tool-call--completed`;
  if (status === ToolCallStatus.Failed) return `${base} tool-call--failed`;
  return base;
}

// ─── Formatting ──────────────────────────────────────────────

/** Format duration in ms to human-readable. */
function formatDuration(ms: number): string {
  if (ms === 0) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** Categorize tool name for color coding. */
function toolCategory(toolName: string): string {
  const reads = ["read", "fetch_content", "web_search", "code_search", "gitnexus"];
  const writes = ["write", "edit", "bash", "ast_grep_replace"];
  const commands = ["bash", "subagent"];

  if (reads.includes(toolName)) return "tool-call--read";
  if (writes.includes(toolName)) return "tool-call--write";
  if (commands.includes(toolName)) return "tool-call--command";
  if (toolName.includes("search")) return "tool-call--search";
  return "";
}

// ─── Component ───────────────────────────────────────────────

export const ToolCallCard: Component<ToolCallCardProps> = (props) => {
  const cfg = () => statusConfig(props.status);
  const category = () => toolCategory(props.toolName);

  return (
    <div
      class={cardClass(props.status, category())}
      data-testid="tool-call-card"
      role="article"
      aria-label={`Tool call: ${props.toolName}`}
    >
      {/* Progress sweep for active states */}
      {isToolActive(props.status) && (
        <div class="tool-call__sweep" data-testid="tool-progress-sweep" aria-hidden="true" />
      )}

      <div class="tool-call__header">
        <span class="tool-call__name" title={props.toolName}>
          {props.toolName}
        </span>
        <span class={`tool-call__status ${cfg().testId}`} data-testid={cfg().testId} title={cfg().label}>
          {cfg().icon} {cfg().label}
        </span>
        <span class="tool-call__duration" title="Duration">
          {formatDuration(props.durationMs)}
        </span>
      </div>

      {(props.target || Object.keys(props.arguments).length > 0) && (
        <div class="tool-call__target" title="Target / Arguments">
          {props.target || JSON.stringify(props.arguments).slice(0, 80)}
        </div>
      )}

      {props.resultPreview && (
        <div class="tool-call__result" data-testid="tool-result-preview">
          {props.resultPreview}
        </div>
      )}
    </div>
  );
};
