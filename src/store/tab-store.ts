/// Tab Store — reactive SolidJS store for tab switcher state.
///
/// Manages which tab is active (Structured / Terminal), tracks
/// unread badge counts per tab, and auto-clears badges when the
/// user switches to a tab.

import {
  createSignal,
  createMemo,
} from "solid-js";
import {
  TabId,
  type TabBadgeCounts,
  DEFAULT_TAB_BADGE_COUNTS,
  type TabStoreOptions,
} from "../lib/tab-types";

// ─── Store Interface ───────────────────────────────────────────

export interface TabStore {
  // Signals
  activeTab: () => TabId;
  badgeCounts: () => TabBadgeCounts;

  // Actions
  setActiveTab: (tab: TabId) => void;
  incrementBadge: (tab: TabId) => void;
  clearBadges: () => void;

  // Computed
  isStructuredActive: () => boolean;
  isTerminalActive: () => boolean;
}

// ─── Factory ───────────────────────────────────────────────────

/** Create a new tab store. */
export function createTabStore(options?: TabStoreOptions): TabStore {
  const defaultTab = options?.defaultMode === "pty"
    ? TabId.Terminal
    : TabId.Structured;

  const [activeTab, setActiveTabSignal] = createSignal<TabId>(defaultTab);
  const [badgeCounts, setBadgeCounts] = createSignal<TabBadgeCounts>({
    ...DEFAULT_TAB_BADGE_COUNTS,
  });

  return {
    // Signals
    activeTab,
    badgeCounts,

    // Actions
  setActiveTab(tab: TabId) {
    // Auto-clear badge for the tab we're switching TO
    const key = tab === TabId.Structured ? "structured" : "terminal";
    setBadgeCounts((prev) => ({
      ...prev,
      [key]: 0,
    }));
    setActiveTabSignal(tab);
  },

  incrementBadge(tab: TabId) {
    const key = tab === TabId.Structured ? "structured" : "terminal";
    setBadgeCounts((prev) => ({
      ...prev,
      [key]: prev[key] + 1,
    }));
  },

    clearBadges() {
      setBadgeCounts({ ...DEFAULT_TAB_BADGE_COUNTS });
    },

    // Computed
    isStructuredActive: createMemo(() => activeTab() === TabId.Structured),
    isTerminalActive: createMemo(() => activeTab() === TabId.Terminal),
  };
}
