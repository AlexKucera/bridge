/* LogFilters — Filter bar for Captain's Log

   Time range pills, event type multi-select, pinned toggle.
   All filters combine with AND logic. */

import { For } from "solid-js";
import type { LogQueryFilter, LogEventType } from "../lib/log-types";

const TIME_RANGES = [
  { label: "1h", seconds: 3600 },
  { label: "24h", seconds: 86400 },
  { label: "7d", seconds: 604800 },
  { label: "30d", seconds: 2592000 },
] as const;

const EVENT_TYPES: LogEventType[] = ["Run", "Ship", "Warn", "Error", "Crew"];

interface Props {
  filter: () => LogQueryFilter;
  pinnedCount: () => number;
  onTimeRangeChange: (seconds: number | null) => void;
  onTypeToggle: (type: string) => void;
  onPinnedToggle: () => void;
}

export function LogFilters(props: Props) {
  function isActiveTimeRange(seconds: number | null) {
    return props.filter().timeRange === seconds;
  }

  function isActiveType(type: string) {
    return props.filter().types?.includes(type) ?? false;
  }

  return (
    <div class="log-filters">
      {/* Time range pills */}
      <div class="log-filter-group">
        <span class="log-filter-label">Time</span>
        <For each={TIME_RANGES}>
          {(range) => (
            <button
              class={`log-pill ${isActiveTimeRange(range.seconds) ? "active" : ""}`}
              onClick={() =>
                props.onTimeRangeChange(
                  isActiveTimeRange(range.seconds) ? null : range.seconds
                )
              }
              data-testid={`time-range-${range.label}`}
            >
              {range.label}
            </button>
          )}
        </For>
      </div>

      {/* Event type pills */}
      <div class="log-filter-group">
        <span class="log-filter-label">Type</span>
        <For each={EVENT_TYPES}>
          {(type) => (
            <button
              class={`log-pill type-${type.toLowerCase()} ${isActiveType(type) ? "active" : ""}`}
              onClick={() => props.onTypeToggle(type)}
              data-testid={`type-${type.toLowerCase()}`}
            >
              {type}
            </button>
          )}
        </For>
      </div>

      {/* Pinned toggle */}
      <button
        class={`log-pill pinned-toggle ${props.filter().pinnedOnly ? "active" : ""}`}
        onClick={() => props.onPinnedToggle()}
        data-testid="pinned-toggle"
      >
        📌 {props.pinnedCount()}
      </button>
    </div>
  );
}
