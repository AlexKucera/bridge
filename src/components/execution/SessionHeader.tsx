/// SessionHeader — sticky top bar showing session metadata and live status.
///
/// Renders model name, provider, thinking level, elapsed time,
/// and an animated status badge that changes color/pulse per LiveState.

import { createMemo } from "solid-js";
import type { Component } from "solid-js";
import { LiveState } from "../../lib/execution-types";

// ─── Props ──────────────────────────────────────────────────

export interface SessionHeaderProps {
  modelName: string;
  provider: string;
  thinkingLevel: string;
  status: LiveState;
  elapsedMs: number;
}

// ─── Helpers ─────────────────────────────────────────────────

/** Format milliseconds into mm:ss or hh:mm:ss. */
function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${String(mins).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** CSS class for status badge based on LiveState. */
function statusClass(status: LiveState): string {
  switch (status) {
    case LiveState.Thinking:
    case LiveState.RunningTool:
    case LiveState.StreamingText:
      return "status-badge status-badge--active";
    case LiveState.Done:
      return "status-badge status-badge--done";
    case LiveState.Error:
      return "status-badge status-badge--error";
    case LiveState.Stopped:
      return "status-badge status-badge--stopped";
    default:
      return "status-badge status-badge--idle";
  }
}

// ─── Component ───────────────────────────────────────────────

export const SessionHeader: Component<SessionHeaderProps> = (props) => {
  const elapsed = createMemo(() => formatElapsed(props.elapsedMs));

  return (
    <header class="session-header">
      <div class="session-header__info">
        <span class="session-header__model" title={props.modelName}>
          {props.modelName || "—"}
        </span>
        <span class="session-header__provider" title={props.provider}>
          {props.provider || "—"}
        </span>
        {props.thinkingLevel && (
          <span class="session-header__thinking">
            🧠 {props.thinkingLevel}
          </span>
        )}
      </div>

      <div class="session-header__meta">
        <span class={statusClass(props.status)}>
          {props.status}
        </span>
        <span class="session-header__elapsed" title="Elapsed time">
          ⏱ {elapsed()}
        </span>
      </div>
    </header>
  );
};
