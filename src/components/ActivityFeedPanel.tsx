/* ActivityFeedPanel — Real-time activity dashboard panel

   280px right-column panel showing recent fleet events.
   Auto-fit grid of FeedItem components.
   Listens on `activity-feed-event` Tauri channel for real-time updates.
   Shows last 50 events with "View full log" link. */

import { For, Show, createSignal, onMount, onCleanup } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { LogEntry } from "../lib/log-types";
import { EVENT_TYPE_ICONS, EVENT_TYPE_COLORS } from "../lib/log-types";

interface Props {
  entries: () => LogEntry[];
}

/** Format relative timestamp (e.g., "2m ago", "15m ago"). */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Truncate message to ~80 chars with ellipsis. */
function truncate(msg: string, max = 80): string {
  return msg.length > max ? msg.slice(0, max) + "…" : msg;
}

export function FeedItem(props: { entry: LogEntry }) {
  const color = () =>
    EVENT_TYPE_COLORS[props.entry.eventType as keyof typeof EVENT_TYPE_COLORS] ?? "#888";
  const icon = () =>
    EVENT_TYPE_ICONS[props.entry.eventType as keyof typeof EVENT_TYPE_ICONS] ?? "•";

  return (
    <div class="feed-item" data-testid={`feed-item-${props.entry.id}`}>
      <span
        class="feed-item-icon"
        style={{ color: color() }}
        title={props.entry.eventType}
      >
        {icon()}
      </span>
      <div class="feed-item-body">
        <span class="feed-item-message" data-testid="feed-message">
          {truncate(props.entry.message)}
        </span>
        <div class="feed-item-meta">
          <Show when={props.entry.vesselName}>
            <span class="feed-vessel-name" data-testid="feed-vessel-name">
              {props.entry.vesselName}
            </span>
          </Show>
          <span class="feed-time-ago" data-testid="feed-time-ago">
            {timeAgo(props.entry.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ActivityFeedPanel(props: Props) {
  const [liveEntries, setLiveEntries] = createSignal<LogEntry[]>([]);
  let unlisten: UnlistenFn | null = null;

  // Subscribe to real-time events
  onMount(async () => {
    unlisten = await listen<LogEntry>("activity-feed-event", (event) => {
      setLiveEntries((prev) => [event.payload, ...prev].slice(0, 50));
    });
  });

  onCleanup(() => {
    unlisten?.();
  });

  // Merge initial entries with live ones
  const displayEntries = () => {
    const live = liveEntries();
    const base = props.entries().slice(0, 50 - live.length);
    return [...live, ...base];
  };

  return (
    <div class="activity-feed-panel" data-testid="activity-feed-panel">
      <div class="activity-feed-header">
        <h3 class="activity-feed-title">Activity</h3>
      </div>

      <div class="activity-feed-list">
        <Show
          when={displayEntries().length > 0}
          fallback={
            <div class="feed-empty-state" data-testid="feed-empty">
              <span class="feed-empty-icon">⚓</span>
              <p>No fleet activity yet.</p>
              <p class="feed-empty-hint">Set sail!</p>
            </div>
          }
        >
          <For each={displayEntries()}>
            {(entry) => <FeedItem entry={entry} />}
          </For>
        </Show>
      </div>

      <a href="#/log" class="feed-view-full-link" data-testid="view-full-log">
        View full log →
      </a>
    </div>
  );
}
