import { describe, it, expect, vi } from "vitest";
import { render } from "@solidjs/testing-library";
import { LogFilters } from "../components/LogFilters";
import { LogEventRow } from "../components/LogEventRow";
import { LogTimeline } from "../components/LogTimeline";
import type { LogEntry, LogQueryFilter } from "../lib/log-types";

const MOCK_ENTRY: LogEntry = {
  id: 1,
  vesselId: 42,
  vesselName: "bridge",
  eventType: "Run",
  message: "Session started for bridge",
  metadata: null,
  pinned: false,
  createdAt: new Date().toISOString(),
};

const PINNED_ENTRY: LogEntry = {
  ...MOCK_ENTRY,
  id: 2,
  pinned: true,
  event_type: "Error",
  message: "Connection timeout",
};

describe("LogFilters", () => {
  const defaultFilter: LogQueryFilter = {
    timeRange: null,
    types: null,
    pinnedOnly: false,
    vesselId: null,
    searchText: null,
  };

  it("renders time range pills", () => {
    const { getByTestId } = render(() => (
      <LogFilters
        filter={() => defaultFilter}
        pinnedCount={() => 0}
        onTimeRangeChange={vi.fn()}
        onTypeToggle={vi.fn()}
        onPinnedToggle={vi.fn()}
      />
    ));
    expect(getByTestId("time-range-1h")).toBeTruthy();
    expect(getByTestId("time-range-24h")).toBeTruthy();
    expect(getByTestId("time-range-7d")).toBeTruthy();
    expect(getByTestId("time-range-30d")).toBeTruthy();
  });

  it("renders event type pills", () => {
    const { getByTestId } = render(() => (
      <LogFilters
        filter={() => defaultFilter}
        pinnedCount={() => 0}
        onTimeRangeChange={vi.fn()}
        onTypeToggle={vi.fn()}
        onPinnedToggle={vi.fn()}
      />
    ));
    expect(getByTestId("type-run")).toBeTruthy();
    expect(getByTestId("type-error")).toBeTruthy();
    expect(getByTestId("type-warn")).toBeTruthy();
    expect(getByTestId("type-ship")).toBeTruthy();
    expect(getByTestId("type-crew")).toBeTruthy();
  });

  it("renders pinned toggle with count", () => {
    const { getByTestId, getByText } = render(() => (
      <LogFilters
        filter={() => defaultFilter}
        pinnedCount={() => 3}
        onTimeRangeChange={vi.fn()}
        onTypeToggle={vi.fn()}
        onPinnedToggle={vi.fn()}
      />
    ));
    expect(getByTestId("pinned-toggle")).toBeTruthy();
    expect(getByTestId("pinned-toggle").textContent).toContain("3");
  });
});

describe("LogEventRow", () => {
  it("renders time, icon, message, and actions", () => {
    const { getByTestId } = render(() => (
      <LogEventRow
        entry={MOCK_ENTRY}
        onPin={vi.fn()}
        onCopy={vi.fn()}
      />
    ));

    expect(getByTestId("event-time")).toBeTruthy();
    expect(getByTestId("event-type-icon")).toBeTruthy();
    expect(getByTestId("event-message").textContent).toBe(MOCK_ENTRY.message);
    expect(getByTestId("pin-btn")).toBeTruthy();
    expect(getByTestId("copy-btn")).toBeTruthy();
  });

  it("shows vessel name when present", () => {
    const { getByTestId } = render(() => (
      <LogEventRow
        entry={MOCK_ENTRY}
        onPin={vi.fn()}
        onCopy={vi.fn()}
      />
    ));
    expect(getByTestId("event-vessel-name").textContent).toContain("bridge");
  });

  it("calls onPin with correct id", async () => {
    const onPin = vi.fn();
    const { getByTestId } = render(() => (
      <LogEventRow
        entry={MOCK_ENTRY}
        onPin={onPin}
        onCopy={vi.fn()}
      />
    ));

    getByTestId("pin-btn").click();
    expect(onPin).toHaveBeenCalledWith(1);
  });

  it("calls onCopy with formatted text", async () => {
    const onCopy = vi.fn();
    const { getByTestId } = render(() => (
      <LogEventRow
        entry={MOCK_ENTRY}
        onPin={vi.fn()}
        onCopy={onCopy}
      />
    ));

    getByTestId("copy-btn").click();
    expect(onCopy).toHaveBeenCalledWith(
      "[Run] Session started for bridge (bridge)"
    );
  });

  it("shows expand button when metadata exists", () => {
    const entryWithMeta: LogEntry = {
      ...MOCK_ENTRY,
      metadata: { session_id: 99 },
    };
    const { getByTestId, queryByTestId } = render(() => (
      <LogEventRow
        entry={entryWithMeta}
        onPin={vi.fn()}
        onCopy={vi.fn()}
      />
    ));
    expect(getByTestId("expand-btn")).toBeTruthy();

    // Entry without metadata should not have expand
    const { queryByTestId: q2 } = render(() => (
      <LogEventRow
        entry={MOCK_ENTRY}
        onPin={vi.fn()}
        onCopy={vi.fn()}
      />
    ));
    expect(q2("expand-btn")).toBeNull();
  });
});

describe("LogTimeline", () => {
  it("renders day groups with headers", () => {
    const today = new Date().toISOString();
    const entries: LogEntry[] = [
      { ...MOCK_ENTRY, createdAt: today },
      { ...PINNED_ENTRY, createdAt: today },
    ];

    const { getByTestId } = render(() => (
      <LogTimeline
        entries={() => entries}
        onPin={vi.fn()}
        onCopy={vi.fn()}
      />
    ));

    expect(getByTestId("log-timeline")).toBeTruthy();
    expect(getByTestId("day-header").textContent).toBe("Today");
  });

  it("shows empty state when no entries", () => {
    const { getByTestId } = render(() => (
      <LogTimeline
        entries={() => []}
        onPin={vi.fn()}
        onCopy={vi.fn()}
      />
    ));

    expect(getByTestId("log-empty")).toBeTruthy();
  });

  it("renders multiple event rows per day group", () => {
    const now = new Date().toISOString();
    const entries: LogEntry[] = [
      { ...MOCK_ENTRY, id: 1, createdAt: now },
      { ...MOCK_ENTRY, id: 2, message: "Second event", createdAt: now },
    ];

    const { getAllByTestId } = render(() => (
      <LogTimeline
        entries={() => entries}
        onPin={vi.fn()}
        onCopy={vi.fn()}
      />
    ));

    const rows = getAllByTestId(/^log-event-/);
    expect(rows.length).toBe(2);
  });
});
