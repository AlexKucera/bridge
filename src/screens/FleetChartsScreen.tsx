/* FleetChartsScreen — Analytics and metrics screen
   Uses OverlayLayout for consistent sidebar + content shell. */

import { OverlayLayout } from "../components/OverlayLayout";

const CHARTS_NAV = [
  {
    title: "Fleet",
    items: [
      { href: "/fleet", label: "Dashboard", icon: "⚓" },
      { href: "/charts", label: "Charts", icon: "📊" },
    ],
  },
  {
    title: "Analytics",
    items: [
      { href: "/charts", label: "Overview", icon: "📊" },
      { href: "/charts#performance", label: "Performance" },
      { href: "/charts#trends", label: "Trends" },
    ],
  },
] as const;

export function FleetChartsScreen() {
  return (
    <OverlayLayout
      title="Charts"
      subtitle="Analytics, performance metrics, and fleet-wide trends"
      navSections={CHARTS_NAV}
      currentPath="/charts"
    >
      <div class="charts">
        <p>Analytics and metrics coming in a future slice.</p>
      </div>
    </OverlayLayout>
  );
}
