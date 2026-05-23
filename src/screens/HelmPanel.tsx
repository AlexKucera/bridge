/* HelmPanel — Vessel command interface
   Uses OverlayLayout for consistent sidebar + content shell. */

import { OverlayLayout } from "../components/OverlayLayout";

const HELM_NAV = [
  {
    title: "Fleet",
    items: [
      { href: "/fleet", label: "Dashboard", icon: "⚓" },
      { href: "/helm", label: "Helm", icon: "🧭" },
    ],
  },
  {
    title: "Command",
    items: [
      { href: "/helm", label: "Console", icon: "🧭" },
      { href:="/helm/appearance", label: "Appearance" },
      { href: "/helm/commands", label: "Commands" },
      { href: "/helm/settings", label: "Settings" },
    ],
  },
] as const;

export function HelmPanel() {
  return (
    <OverlayLayout
      title="Helm"
      subtitle="Vessel command interface with execution controls"
      navSections={HELM_NAV}
      currentPath="/helm"
    >
      <p>Vessel command interface coming in a future slice.</p>
    </OverlayLayout>
  );
}
