/// UnknownEventCard — collapsible raw JSON block for unknown/future event types.
///
/// Renders a minimal preserved block showing the event type and
/// raw JSON payload. Never crashes the UI — uses safe JSON.stringify.
/// Collapsed shows only event type; expanded shows full JSON.

import { createSignal } from "solid-js";
import type { Component } from "solid-js";

export interface UnknownEventCardProps {
  event: Record<string, unknown>;
}

export const UnknownEventCard: Component<UnknownEventCardProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const eventType = () => (props.event.type as string) ?? "unknown";

  /** Safe JSON stringify that handles circular refs. */
  function safeJson(): string {
    try {
      return JSON.stringify(props.event, null, 2);
    } catch {
      return String(props.event);
    }
  }

  return (
    <div
      class="unknown-event-card"
      data-testid="unknown-event-card"
      role="article"
      aria-label={`Unknown event: ${eventType()}`}
    >
      <button
        class="unknown-event-card__header"
        onClick={() => setExpanded(!expanded())}
        aria-expanded={expanded()}
        aria-label={`Toggle unknown event: ${eventType()}`}
        type="button"
      >
        <span class="unknown-event-card__icon" aria-hidden="true">❓</span>
        <span class="unknown-event-card__type">{eventType()}</span>
        <span class="unknown-event-card__chevron" aria-hidden="true">
          {expanded() ? "▼" : "▶"}
        </span>
      </button>

      {expanded() && (
        <pre class="unknown-event-card__json" data-testid="unknown-event-json">
          {safeJson()}
        </pre>
      )}
    </div>
  );
};
