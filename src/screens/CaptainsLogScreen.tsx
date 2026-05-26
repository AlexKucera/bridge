/* CaptainsLogScreen — Event feed screen
   Uses OverlayLayout for consistent sidebar + content shell. */

import { OverlayLayout } from "../components/OverlayLayout";

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
  return (
    <OverlayLayout
      title="Captain's Log"
      subtitle="Chronological event feed across all vessels"
      navSections={LOG_NAV}
      currentPath="/log"
    >
      <div class="feed">
        <p>Event feed coming in a future slice.</p>
      </div>
    </OverlayLayout>
  );
}
