/// Tests for tab types and TabStore.
///
/// Covers: TabId enum values, TabBadgeCounts defaults,
/// TabStore lifecycle (default, switch, badge tracking).

import { describe, it, expect, beforeEach } from "vitest";
import { TabId } from "../lib/tab-types";
import { createTabStore } from "../store/tab-store";

// ─── TabId Enum ────────────────────────────────────────────────

describe("TabId", () => {
  it("has exactly two variants", () => {
    expect(Object.values(TabId)).toEqual(["Structured", "Terminal"]);
  });
});

// ─── TabBadgeCounts Defaults ───────────────────────────────────

describe("DEFAULT_TAB_BADGE_COUNTS", () => {
  // Import after we create the file; for now test via store factory
  it("starts at zero for both tabs", () => {
    const store = createTabStore();
    expect(store.badgeCounts().structured).toBe(0);
    expect(store.badgeCounts().terminal).toBe(0);
  });
});

// ─── TabStore Lifecycle ────────────────────────────────────────

describe("TabStore", () => {
  let store: ReturnType<typeof createTabStore>;

  beforeEach(() => {
    store = createTabStore();
  });

  it("defaults to Structured tab", () => {
    expect(store.activeTab()).toBe(TabId.Structured);
  });

  it("switches to Terminal tab", () => {
    store.setActiveTab(TabId.Terminal);
    expect(store.activeTab()).toBe(TabId.Terminal);
  });

  it("switches back to Structured", () => {
    store.setActiveTab(TabId.Terminal);
    store.setActiveTab(TabId.Structured);
    expect(store.activeTab()).toBe(TabId.Structured);
  });

  it("tracks whether Structured is active", () => {
    expect(store.isStructuredActive()).toBe(true);
    expect(store.isTerminalActive()).toBe(false);

    store.setActiveTab(TabId.Terminal);
    expect(store.isStructuredActive()).toBe(false);
    expect(store.isTerminalActive()).toBe(true);
  });

  it("increments structured badge count", () => {
    store.incrementBadge(TabId.Structured);
    expect(store.badgeCounts().structured).toBe(1);

    store.incrementBadge(TabId.Structured);
    store.incrementBadge(TabId.Structured);
    expect(store.badgeCounts().structured).toBe(3);
  });

  it("increments terminal badge count", () => {
    store.incrementBadge(TabId.Terminal);
    expect(store.badgeCounts().terminal).toBe(1);
  });

  it("clears badge count for active tab when switched to", () => {
    // Accumulate some badges while on Structured
    store.incrementBadge(TabId.Terminal);
    store.incrementBadge(TabId.Terminal);
    expect(store.badgeCounts().terminal).toBe(2);

    // Switch to Terminal — should clear its badge
    store.setActiveTab(TabId.Terminal);
    expect(store.badgeCounts().terminal).toBe(0);
    // Structured badge untouched
    expect(store.badgeCounts().structured).toBe(0);
  });

  it("clears badge count for Structured when switching to it", () => {
    store.setActiveTab(TabId.Terminal); // Start on Terminal
    store.incrementBadge(TabId.Structured);
    store.incrementBadge(TabId.Structured);
    expect(store.badgeCounts().structured).toBe(2);

    store.setActiveTab(TabId.Structured);
    expect(store.badgeCounts().structured).toBe(0);
  });

  it("clears all badges explicitly", () => {
    store.incrementBadge(TabId.Structured);
    store.incrementBadge(TabId.Terminal);
    store.incrementBadge(TabId.Terminal);

    store.clearBadges();
    expect(store.badgeCounts().structured).toBe(0);
    expect(store.badgeCounts().terminal).toBe(0);
  });

  it("sets default tab based on session mode (pty → Terminal)", () => {
    const ptyStore = createTabStore({ defaultMode: "pty" });
    expect(ptyStore.activeTab()).toBe(TabId.Terminal);
  });

  it("sets default tab based on session mode (json → Structured)", () => {
    const jsonStore = createTabStore({ defaultMode: "json" });
    expect(jsonStore.activeTab()).toBe(TabId.Structured);
  });

  it("defaults to Structured when no mode specified", () => {
    const store = createTabStore({});
    expect(store.activeTab()).toBe(TabId.Structured);
  });
});
