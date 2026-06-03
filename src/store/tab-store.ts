/// Tab Store — reactive SolidJS store for tab switcher state.
///
/// Manages which tab is active (Structured / Terminal / Cargo), tracks
/// unread badge counts per tab, and auto-clears badges when the
/// user switches to a tab.

import { createSignal, createMemo } from "solid-js";
import {
  TabId,
  type TabBadgeCounts,
  DEFAULT_TAB_BADGE_COUNTS,
  type TabStoreOptions,
  tabBadgeKey,
} from "../lib/tab-types";

/** Public API surface for the tab store. */
export interface TabStore {
  // State readers
  activeTab: () => TabId;
  badgeCounts: () => TabBadgeCounts;

  // Computed
  isStructuredActive: () => boolean;
  isTerminalActive: () => boolean;
  isCargoActive: () => boolean;

  // Actions
  setActiveTab: (tab: TabId) => void;
  incrementBadge: (tab: TabId) => void;
  clearBadges: () => void;
}

/**
 * Create a reactive tab store for the session view.
 *
 * @param options - Optional default mode (pty → Terminal, json → Structured).
 */
export function createTabStore(options?: TabStoreOptions): TabStore {
  const [activeTab, setActiveTabSignal] = createSignal<TabId>(
    options?.defaultMode === "pty" ? TabId.Terminal : TabId.Structured,
  );
  const [badgeCounts, setBadgeCounts] =
    createSignal<TabBadgeCounts>(DEFAULT_TAB_BADGE_COUNTS);

  return {
    // State readers
    activeTab,
    badgeCounts,

    // Computed
    isStructuredActive: createMemo(() => activeTab() === TabId.Structured),
    isTerminalActive: createMemo(() => activeTab() === TabId.Terminal),
    isCargoActive: createMemo(() => activeTab() === TabId.Cargo),

    // Actions

    setActiveTab(tab: TabId) {
      // Auto-clear badge for the tab we're switching TO
      const key = tabBadgeKey(tab);
      setBadgeCounts((prev) => ({
        ...prev,
        [key]: 0,
      }));
      setActiveTabSignal(tab);
    },

    incrementBadge(tab: TabId) {
      const key = tabBadgeKey(tab);
      setBadgeCounts((prev) => ({
        ...prev,
        [key]: prev[key] + 1,
      }));
    },

    clearBadges() {
      setBadgeCounts(DEFAULT_TAB_BADGE_COUNTS);
    },
  };
}
