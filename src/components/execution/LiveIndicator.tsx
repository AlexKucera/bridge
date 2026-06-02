/// LiveIndicator — phase badge showing Pi's current execution state.
///
/// Color-coded per phase with smooth CSS transitions.
/// Pulses for active phases (Thinking, RunningTool, StreamingText).
/// Static for terminal phases (Done, Error, Stopped).

import type { Component } from "solid-js";
import { LiveState } from "../../lib/execution-types";

// ─── Props ──────────────────────────────────────────────────

export interface LiveIndicatorProps {
  status: LiveState;
}

// ─── State Classification ───────────────────────────────────

/** Phases where the agent is actively working. */
const ACTIVE_STATES = new Set<LiveState>([
  LiveState.Thinking,
  LiveState.RunningTool,
  LiveState.StreamingText,
]);

/** Terminal / final states. */
const TERMINAL_STATES = new Set<LiveState>([
  LiveState.Done,
  LiveState.Error,
  LiveState.Stopped,
]);

export function isLiveActive(status: LiveState): boolean {
  return ACTIVE_STATES.has(status);
}

export function isLiveTerminal(status: LiveState): boolean {
  return TERMINAL_STATES.has(status);
}

// ─── CSS Class ───────────────────────────────────────────────

function indicatorClass(status: LiveState): string {
  const base = "live-indicator";
  if (isLiveActive(status)) return `${base} ${base}--active`;
  if (status === LiveState.Done) return `${base} ${base}--done`;
  if (status === LiveState.Error) return `${base} ${base}--error`;
  if (status === LiveState.Stopped) return `${base} ${base}--stopped`;
  return `${base} ${base}--idle`;
}

// ─── Component ───────────────────────────────────────────────

export const LiveIndicator: Component<LiveIndicatorProps> = (props) => {
  return (
    <span
      class={indicatorClass(props.status)}
      data-testid="live-indicator"
      role="status"
      aria-live="polite"
    >
      {props.status}
    </span>
  );
};
