/// TurnMetricsBar — inline bar showing tokens | cost | tools | duration.
///
/// Renders a compact horizontal metrics strip with tabular numbers
/// for easy scanning of per-turn resource usage.

import type { Component } from "solid-js";
import type { TurnMetrics } from "../../lib/execution-types";

export interface TurnMetricsBarProps {
  metrics: TurnMetrics;
}

/** Format duration in ms to human-readable string. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Format cost as USD string. */
function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export const TurnMetricsBar: Component<TurnMetricsBarProps> = (props) => {
  const m = () => props.metrics;

  return (
    <div class="turn-metrics" role="status" aria-label="Turn metrics">
      <span class="turn-metrics__item" title="Tokens used">
        {m().tokensUsed.toLocaleString()}
      </span>
      <span class="turn-metrics__separator" aria-hidden="true">|</span>
      <span class="turn-metrics__item" title="Cost">
        {formatCost(m().costUsd)}
      </span>
      <span class="turn-metrics__separator" aria-hidden="true">|</span>
      <span class="turn-metrics__item" title="Tool calls">
        {m().toolCallCount} tools
      </span>
      <span class="turn-metrics__separator" aria-hidden="true">|</span>
      <span class="turn-metrics__item" title="Duration">
        {formatDuration(m().durationMs)}
      </span>
    </div>
  );
};
