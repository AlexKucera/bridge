import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLogStore } from "../store/log-store";
import type { LogEntry } from "../lib/log-types";

// Mock Tauri invoke
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// Mock Tauri event listen
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

import { invoke } from "@tauri-apps/api/core";

const MOCK_ENTRY: LogEntry = {
  id: 1,
  vesselId: null,
  vesselName: null,
  eventType: "Run",
  message: "Session started",
  metadata: null,
  pinned: false,
  createdAt: "2026-06-03T12:00:00Z",
};

describe("createLogStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchLogs", () => {
    it("populates entries from invoke result", async () => {
      const store = createLogStore();
      const mockEntries = [MOCK_ENTRY];
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(mockEntries);

      await store.fetchLogs();

      expect(store.entries()).toEqual(mockEntries);
      expect(invoke).toHaveBeenCalledWith("query_logs", {
        filter: store.filter(),
      });
    });

    it("sets loading state during fetch", async () => {
      const store = createLogStore();
      let resolvePromise!: (v: LogEntry[]) => void;
      (invoke as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise<LogEntry[]>((r) => (resolvePromise = r))
      );

      const fetchP = store.fetchLogs();
      expect(store.loading()).toBe(true);

      resolvePromise!([MOCK_ENTRY]);
      await fetchP;
      expect(store.loading()).toBe(false);
    });

    it("sets error on failure", async () => {
      const store = createLogStore();
      (invoke as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db error"));

      await store.fetchLogs();

      expect(store.error()).toBe("db error");
      expect(store.entries()).toEqual([]);
    });
  });

  describe("setFilter / resetFilter", () => {
    it("merges filter updates", () => {
      const store = createLogStore();
      store.setFilter({ types: ["Error"] });
      expect(store.filter().types).toEqual(["Error"]);
      // Other fields remain default
      expect(store.filter().pinnedOnly).toBe(false);
    });

    it("resets to defaults", () => {
      const store = createLogStore();
      store.setFilter({ pinnedOnly: true, searchText: "foo" });
      store.resetFilter();
      expect(store.filter().pinnedOnly).toBe(false);
      expect(store.filter().searchText).toBe(null);
    });
  });

  describe("pinEntry / unpinEntry", () => {
    it("calls pin_log_entry and refreshes", async () => {
      const store = createLogStore();
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await store.pinEntry(5);

      expect(invoke).toHaveBeenCalledWith("pin_log_entry", { entryId: 5 });
    });

    it("calls unpin_log_entry and refreshes", async () => {
      const store = createLogStore();
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await store.unpinEntry(10);

      expect(invoke).toHaveBeenCalledWith("unpin_log_entry", { entryId: 10 });
    });
  });

  describe("pinnedCount", () => {
    it("counts pinned entries", async () => {
      const store = createLogStore();
      (invoke as ReturnType<typeof vi.fn>).mockResolvedValue([
        { ...MOCK_ENTRY, id: 1, pinned: true },
        { ...MOCK_ENTRY, id: 2, pinned: false },
        { ...MOCK_ENTRY, id: 3, pinned: true },
      ]);

      await store.fetchLogs();

      expect(store.pinnedCount()).toBe(2);
    });
  });
});
