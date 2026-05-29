/* FleetDashboard — 3-column fleet overview

   Layout: 180px sidebar | fluid content | 280px activity feed

   - Left sidebar: "Add Vessel" button + scrollable VesselCard list
   - Center: vessel detail or empty-state CTA
   - Right: activity feed placeholder (Slice 12)

   State:
   - vessels: fetched from backend via vessel_list_with_git
   - dialogOpen / dialogError: controls AddVesselDialog modal */

import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { OverlayLayout } from "../components/OverlayLayout";
import { VesselCard } from "../components/VesselCard";
import { AddVesselDialog } from "../components/AddVesselDialog";

interface VesselWithGit {
  id: number;
  name: string;
  path: string;
  display_name: string | null;
  branch: string | null;
  dirty: boolean;
}

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
  const [vessels, setVessels] = createSignal<VesselWithGit[]>([]);
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [dialogError, setDialogError] = createSignal<string>("");

  async function loadVessels() {
    try {
      const list = await invoke<VesselWithGit[]>("vessel_list_with_git");
      setVessels(list);
    } catch (e) {
      console.error("Failed to load vessels:", e);
    }
  }

  onMount(() => { loadVessels(); });

  async function handleAddVessel(path: string, displayName: string) {
    setDialogError("");
    try {
      await invoke("vessel_add", { path, displayName: displayName || null });
      setDialogOpen(false);
      loadVessels(); // refresh list
    } catch (e: any) {
      setDialogError(e?.message || String(e) || "Failed to add vessel");
    }
  }

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
          <div class="flex items-center justify-between px-3 py-2">
            <p class="text-xs text-[var(--text-muted)] uppercase tracking-wider">Vessels</p>
            <button
              onClick={() => setDialogOpen(true)}
              class="add-vessel-btn text-xs font-medium px-2 py-1 rounded"
              style={{
                border: "1px solid var(--color-primary)",
                color: "var(--color-primary)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              + Add
            </button>
          </div>
          {/* VesselCard list */}
          {vessels().length === 0 ? (
            <p class="px-3 py-2 text-sm text-[var(--text-muted)]">No vessels added yet.</p>
          ) : (
            <div class="vessel-list">
              {vessels().map((v) => (
                <VesselCard
                  vessel={{ id: v.id, name: v.display_name || v.name, path: v.path }}
                  branch={v.branch ?? undefined}
                  dirty={v.dirty}
                />
              ))}
            </div>
          )}
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

      <AddVesselDialog
        open={dialogOpen()}
        onClose={() => { setDialogOpen(false); setDialogError(""); }}
        onSubmit={handleAddVessel}
        error={dialogError() || undefined}
      />
    </OverlayLayout>
  );
}
