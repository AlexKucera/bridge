/* VesselDetailScreen — Individual vessel detail view
   Uses OverlayLayout for consistent sidebar + content shell. */

import { useParams } from "@solidjs/router";
import { OverlayLayout } from "../components/OverlayLayout";

const VESSEL_NAV = [
  {
    title: "Fleet",
    items: [
      { href:="/fleet", label: "Dashboard", icon: "⚓" },
      { href:="/helm", label: "Helm", icon: "🧭" },
    ],
  },
] as const;

export function VesselDetailScreen() {
  const params = useParams();
  return (
    <OverlayLayout
      title={`Vessel ${params.id}`}
      subtitle="Individual vessel status and controls"
      navSections={VESSEL_NAV}
    >
      <p>Vessel detail view coming in a future slice.</p>
    </OverlayLayout>
  );
}
