/* FleetDashboard — 3-column fleet overview

   Layout: 180px sidebar | fluid content | 280px activity feed

   - FleetSidebar (left): scrollable list of VesselCards
   - Content area (center): vessel detail or fleet overview
   - ActivityFeedPanel (right): placeholder for Slice 12 */

import { OverlayLayout } from "../components/OverlayLayout";

const FLEET_NAV = [
  {
    title: "Fleet",
    items: [
      { href: "/fleet", label: "Dashboard", icon: "⚓" },
      { href: "/charts", label: "Charts", icon: "📊" },
    ],
  },
] as const;

export function FleetDashboard() {
  return (
    <OverlayLayout
      title="Fleet"
      subtitle="Monitor all vessels, status, and active missions"
      navSections={FLEET_NAV}
      currentPath="/fleet"
    >
      <div class="fleet-dashboard grid" style={{
        "grid-template-columns": "180px 1fr 280px",
        "grid-template-rows": "1fr",
        height: "calc(100vh - 120px)",
        gap: "0",
      }}>
        {/* Left: Vessel sidebar */}
        <aside class="fleet-sidebar overflow-y-auto border-r border-[var(--border)] bg-[var(--bg-secondary)]">
          <p class="p-3 text-xs text-[var(--text-muted)] uppercase tracking-wider">Vessels</p>
          {/* VesselCard components render here */}
          <p class="px-3 py-2 text-sm text-[var(--text-muted)]">No vessels added yet.</p>
        </aside>

        {/* Center: Content area */}
        <main class="fleet-content overflow-y-auto p-4">
          <div class="flex h-full items-center justify-center text-[var(--text-muted)]">
            <div class="text-center">
              <p class="text-lg mb-1">No vessel selected</p>
              <p class="text-sm">Add a vessel to get started, or select one from the sidebar.</p>
            </div>
          </div>
        </main>

        {/* Right: Activity feed (placeholder) */}
        <aside class="feed-panel overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-secondary)]">
          <p class="p-3 text-xs text-[var(--text-muted)] uppercase tracking-wider">Activity</p>
          <p class="px-3 py-2 text-sm text-[var(--text-muted)]">Activity feed coming soon.</p>
        </aside>
      </div>
    </OverlayLayout>
  );
}
