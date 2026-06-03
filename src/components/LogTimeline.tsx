/* LogTimeline — Day-grouped event timeline for Captain's Log

   Groups entries by day with sticky headers.
   Shows newest entries at top within each day group.
   Renders empty state when no events match filter. */

import { For, Show } from "solid-js";
import type { LogEntry } from "../lib/log-types";
import { LogEventRow } from "./LogEventRow";

interface Props {
  entries: () => LogEntry[];
  onPin: (id: number) => void;
  onCopy: (text: string) => void;
  onOpen?: (vesselId: number) => void;
}

/** Group entries by calendar day (local time). */
function groupByDay(entries: readonly LogEntry[]): Map<string, LogEntry[]> {
  const groups = new Map<string, LogEntry[]>();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yestStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

  for (const entry of entries) {
    const date = entry.createdAt.split("T")[0];
    let label: string;
    if (date === today) label = "Today";
    else if (date === yestStr) label = "Yesterday";
    else {
      const d = new Date(entry.createdAt);
      label = d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
    }
    const key = label;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }

  return groups;
}

export function LogTimeline(props: Props) {
  const groups = () => groupByDay(props.entries());

  return (
    <div class="log-timeline" data-testid="log-timeline">
      <Show
        when={props.entries().length > 0}
        fallback={
          <div class="log-empty-state" data-testid="log-empty">
            <span class="log-empty-icon">📜</span>
            <p>No events match your filters</p>
            <p class="log-empty-hint">Try adjusting your search or filter criteria</p>
          </div>
        }
      >
        <For each={[...groups().entries()]}>
          {([label, dayEntries]) => (
            <div class="log-day-group" data-testid={`day-group-${label}`}>
              <h3 class="log-day-header" data-testid="day-header">{label}</h3>
              <For each={dayEntries}>
                {(entry) => (
                  <LogEventRow
                    entry={entry}
                    onPin={props.onPin}
                    onCopy={props.onCopy}
                    onOpen={props.onOpen}
                  />
                )}
              </For>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
