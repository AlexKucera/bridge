/* CaptainsLogScreen — Captain's Log event feed screen

   Full-featured log viewer with filters, search, day-grouped timeline,
   and per-event actions (pin, copy, open, expand). */

import { createEffect } from "solid-js";
import { OverlayLayout } from "../components/OverlayLayout";
import { LogFilters } from "../components/LogFilters";
import { LogSearch } from "../components/LogSearch";
import { LogTimeline } from "../components/LogTimeline";
import { createLogStore } from "../store/log-store";
import type { LogEntry } from "../lib/log-types";

const LOG_NAV = [
  {
    title: "Fleet",
    items: [
      { href: "/fleet", label: "Dashboard", icon: "⚓" },
      { href: "/charts", label: "Charts", icon: "📊" },
      { href: "/log", label: "Log", icon: "📜" },
    ],
  },
  {
    title: "Filters",
    items: [
      { href: "/log", label: "All Events" },
      { href: "/log?filter=alerts", label: "Alerts" },
      { href: "/log?filter=commands", label: "Commands" },
      { href: "/log?filter=docking", label: "Docking" },
    ],
  },
] as const;

export function CaptainsLogScreen() {
  const store = createLogStore();

  // Initial fetch on mount
  createEffect(() => {
    store.fetchLogs();
  });

  function handleTimeRangeChange(seconds: number | null) {
    store.setFilter({ timeRange: seconds });
    store.fetchLogs();
  }

  function handleTypeToggle(type: string) {
    const current = store.filter().types;
    const updated = current?.includes(type)
      ? current.filter((t) => t !== type)
      : [...(current ?? []), type];
    store.setFilter({ types: updated.length > 0 ? updated : null });
    store.fetchLogs();
  }

  function handlePinnedToggle() {
    store.setFilter({ pinnedOnly: !store.filter().pinnedOnly });
    store.fetchLogs();
  }

  function handleSearch(text: string | null) {
    store.setFilter({ searchText: text });
    store.fetchLogs();
  }

  function handleSearchClear() {
    store.setFilter({ searchText: null });
    store.fetchLogs();
  }

  async function handlePin(id: number) {
    const entry = store.entries().find((e) => e.id === id);
    if (entry?.pinned) {
      await store.unpinEntry(id);
    } else {
      await store.pinEntry(id);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    // Could show a toast here
  }

  function handleOpenVessel(vesselId: number) {
    // Navigate to vessel detail
    window.location.hash = `#/vessel/${vesselId}`;
  }

  return (
    <OverlayLayout
      title="Captain's Log"
      subtitle="Chronological event feed across all vessels"
      navSections={LOG_NAV}
      currentPath="/log"
    >
      <div class="captains-log">
        {/* Search bar */}
        <LogSearch
          value={() => store.filter().searchText}
          onSearch={handleSearch}
          onClear={handleSearchClear}
        />

        {/* Filter bar */}
        <LogFilters
          filter={() => store.filter()}
          pinnedCount={() => store.pinnedCount()}
          onTimeRangeChange={handleTimeRangeChange}
          onTypeToggle={handleTypeToggle}
          onPinnedToggle={handlePinnedToggle}
        />

        {/* Timeline */}
        <LogTimeline
          entries={() => store.entries()}
          onPin={handlePin}
          onCopy={handleCopy}
          onOpen={handleOpenVessel}
        />
      </div>
    </OverlayLayout>
  );
}
