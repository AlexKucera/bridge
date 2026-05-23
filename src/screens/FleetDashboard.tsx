/* FleetDashboard — Fleet overview screen
   Shows vessel list, status grid, and fleet summary.
   Uses OverlayLayout for consistent sidebar + content shell. */

import { OverlayLayout } from "../components/OverlayLayout";

const FLEET_NAV = [
  {
    title: "Fleet",
    items: [
      { href: "/fleet", label: "Dashboard", icon: "⚓" },
      { href: "/charts", label: "Charts", icon: "📊" },
    ],
  },
  {
    title: "Vessels",
    items: [
      { href: "/vessel/vsl-1", label: "VSL-01" },
      { href: "/vessel/vsl-2", label: "VSL-02" },
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
      <p>Fleet overview coming in a future slice.</p>
    </OverlayLayout>
  );
}
