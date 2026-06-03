/* LogEventRow — Single event row in Captain's Log timeline

   Shows time, type icon (color-coded), message with vessel name,
   and action buttons: Pin, Copy, Open (navigate), Expand (metadata). */

import type { LogEntry } from "../lib/log-types";
import { EVENT_TYPE_ICONS, EVENT_TYPE_COLORS } from "../lib/log-types";

interface Props {
  entry: LogEntry;
  onPin: (id: number) => void;
  onCopy: (text: string) => void;
  onOpen?: (vesselId: number) => void;
}

export function LogEventRow(props: Props) {
  const color = () =>
    EVENT_TYPE_COLORS[props.entry.eventType as keyof typeof EVENT_TYPE_COLORS] ?? "#888";
  const icon = () =>
    EVENT_TYPE_ICONS[props.entry.eventType as keyof typeof EVENT_TYPE_ICONS] ?? "•";

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <div class="log-event-row" data-testid={`log-event-${props.entry.id}`}>
      {/* Time column */}
      <span class="log-event-time" data-testid="event-time">
        {formatTime(props.entry.createdAt)}
      </span>

      {/* Type icon column */}
      <span
        class="log-event-icon"
        style={{ color: color() }}
        data-testid="event-type-icon"
        title={props.entry.eventType}
      >
        {icon()}
      </span>

      {/* Message column */}
      <div class="log-event-message">
        <span data-testid="event-message">{props.entry.message}</span>
        {props.entry.vesselName && (
          <span class="log-vessel-name" data-testid="event-vessel-name">
            {" · "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                props.onOpen?.(props.entry.vesselId!);
              }}
            >
              {props.entry.vesselName}
            </a>
          </span>
        )}
      </div>

      {/* Actions column */}
      <div class="log-event-actions">
        <button
          class={`log-action-btn ${props.entry.pinned ? "pinned" : ""}`}
          onClick={() => props.onPin(props.entry.id)}
          title={props.entry.pinned ? "Unpin" : "Pin"}
          data-testid="pin-btn"
        >
          📌
        </button>

        <button
          class="log-action-btn"
          onClick={() =>
            props.onCopy(
              `[${props.entry.eventType}] ${props.entry.message}` +
                (props.entry.vesselName ? ` (${props.entry.vesselName})` : "")
            )
          }
          title="Copy to clipboard"
          data-testid="copy-btn"
        >
          📋
        </button>

        {props.entry.metadata != null && (
          <details class="log-metadata-details">
            <summary class="log-action-btn" data-testid="expand-btn">
              ⋯
            </summary>
            <pre class="log-metadata-json" data-testid="metadata-json">
              {JSON.stringify(props.entry.metadata, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}
