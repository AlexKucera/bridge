/// Log types for Bridge Captain's Log & Activity Feed.
///
/// Mirrors the Rust log module types (LogEntry, LogQueryFilter, LogEventType).

export interface LogEntry {
  id: number;
  vesselId: number | null;
  vesselName: string | null;
  eventType: string; // "Run" | "Ship" | "Warn" | "Error" | "Crew"
  message: string;
  metadata: Record<string, unknown> | null;
  pinned: boolean;
  createdAt: string; // ISO timestamp
}

export type LogEventType = "Run" | "Ship" | "Warn" | "Error" | "Crew";

export interface LogQueryFilter {
  timeRange?: number | null; // seconds from now (e.g., 3600 = last hour)
  types?: string[] | null;
  pinnedOnly?: boolean;
  vesselId?: number | null;
  searchText?: string | null;
}

/** Color mapping per event type for UI rendering. */
export const EVENT_TYPE_COLORS: Record<LogEventType, string> = {
  Run: "#3b82f6",   // blue
  Ship: "#22c55e",  // green
  Warn: "#f59e0b",  // amber
  Error: "#ef4444", // red
  Crew: "#a855f7",  // purple
};

/** Icon per event type. */
export const EVENT_TYPE_ICONS: Record<LogEventType, string> = {
  Run: "▶",
  Ship: "⚓",
  Warn: "⚠",
  Error: "✕",
  Crew: "👥",
};
