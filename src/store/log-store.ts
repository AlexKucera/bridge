/// Log Store — reactive SolidJS store for Captain's Log state.
///
/// Manages log event queries, filtering, pin/unpin operations,
/// and real-time activity feed subscription.

import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import type { LogEntry, LogQueryFilter } from "../lib/log-types";

// ── Store Interface ─────────────────────────────────────

export interface LogStore {
  // Signals (readers)
  entries: () => LogEntry[];
  filter: () => LogQueryFilter;
  pinnedCount: () => number;
  loading: () => boolean;
  error: () => string | null;

  // Actions
  fetchLogs: (filter?: Partial<LogQueryFilter>) => Promise<void>;
  setFilter: (update: Partial<LogQueryFilter>) => void;
  resetFilter: () => void;
  pinEntry: (id: number) => Promise<void>;
  unpinEntry: (id: number) => Promise<void>;
  refresh: () => Promise<void>;
}

// ── Factory ────────────────────────────────────────────

const DEFAULT_FILTER: LogQueryFilter = {
  timeRange: null,
  types: null,
  pinnedOnly: false,
  vesselId: null,
  searchText: null,
};

export function createLogStore(): LogStore {
  const [entries, setEntries] = createSignal<LogEntry[]>([]);
  const [filter, setFilter] = createSignal<LogQueryFilter>({ ...DEFAULT_FILTER });
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  let unlistenFeed: UnlistenFn | null = null;

  async function doFetchLogs(overrides?: Partial<LogQueryFilter>) {
    setLoading(true);
    setError(null);

    const f = overrides ? { ...filter(), ...overrides } : filter();

    try {
      const result = await invoke<LogEntry[]>("query_logs", { filter: f });
      setEntries(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function doPinEntry(id: number, pin: boolean) {
    try {
      await invoke(pin ? "pin_log_entry" : "unpin_log_entry", { entryId: id });
      // Refresh to get updated state
      await doFetchLogs();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }

  return {
    entries,
    filter,
    pinnedCount: () => entries().filter((e) => e.pinned).length,
    loading,
    error,

    fetchLogs: doFetchLogs,

    setFilter(update: Partial<LogQueryFilter>) {
      setFilter((prev) => ({ ...prev, ...update }));
    },

    resetFilter() {
      setFilter({ ...DEFAULT_FILTER });
    },

    pinEntry(id: number) {
      return doPinEntry(id, true);
    },

    unpinEntry(id: number) {
      return doPinEntry(id, false);
    },

    refresh() {
      return doFetchLogs();
    },
  };
}
