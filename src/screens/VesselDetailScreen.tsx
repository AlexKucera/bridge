/* VesselDetailScreen — Individual vessel detail view with session launch.
 *
 * Flow:
 *   1. User clicks vessel in FleetDashboard → navigates to /vessel/:id
 *   2. This screen shows vessel details + "Launch Session" button
 *   3. Clicking launch opens LaunchDialog (mode, prompt, templates)
 *   4. On successful launch → SessionViewContainer renders with
 *      TabBar (Structured / Terminal) + PiExecutionPanel + CommsDeckPanel
 */

import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { useParams, useNavigate } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import { OverlayLayout } from "../components/OverlayLayout";
import type { VesselData } from "../components/VesselCard";
import { LaunchDialog } from "../components/LaunchDialog";
import { SessionViewContainer } from "../components/terminal/SessionViewContainer";
import { createTabStore } from "../store/tab-store";
import { createPtyStore } from "../store/pty-store";
import { createPiExecutionStore } from "../store/pi-store";

const VESSEL_NAV = [
  {
    title: "Fleet",
    items: [
      { href: "/fleet", label: "Dashboard", icon: "⚓" },
      { href: "/helm", label: "Helm", icon: "🧭" },
    ],
  } as const,
];

export function VesselDetailScreen() {
  const params = useParams();
  const navigate = useNavigate();
  const vesselId = () => Number(params.id);

  // ── Vessel data ──────────────────────────────────────────────
  const [vessel, setVessel] = createSignal<VesselData | null>(null);
  const [loading, setLoading] = createSignal(true);

  // ── Launch dialog state ─────────────────────────────────────
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [launchedSessionId, setLaunchedSessionId] = createSignal<number | null>(null);

  // ── Session stores (created on launch) ───────────────────────
  const [tabStore, setTabStore] = createSignal<ReturnType<typeof createTabStore> | null>(null);
  const [ptyStore, setPtyStore] = createSignal<ReturnType<typeof createPtyStore> | null>(null);
  const [execStore, setExecStore] = createSignal<ReturnType<typeof createPiExecutionStore> | null>(null);

  // Load vessel details
  onMount(async () => {
    try {
      const id = vesselId();
      const v = await invoke<any>("vessel_get", { id });
      if (v) {
        setVessel({
          id: v.id,
          name: v.name,
          path: v.path,
          display_name: v.display_name,
          created_at: v.created_at,
          updated_at: v.updated_at,
        });
      }
    } catch (e) {
      console.error("Failed to load vessel:", e);
    } finally {
      setLoading(false);
    }
  });

  // Handle launch success
  const handleLaunched = (sessionId: number) => {
    setLaunchedSessionId(sessionId);
    setDialogOpen(false);

    // Create stores for this session
    const sid = String(sessionId);
    setTabStore(createTabStore({ defaultMode: "pty" }));
    setPtyStore(createPtyStore());
    setExecStore(createPiExecutionStore());

    // Connect PTY store
    ptyStore()?.connect(sid);
  };

  // Cleanup stores on unmount
  onCleanup(() => {
    ptyStore()?.disconnect();
  });

  return (
    <OverlayLayout
      title={vessel()?.display_name || vessel()?.name || `Vessel ${params.id}`}
      subtitle={vessel()?.path || ""}
      navSections={VESSEL_NAV}
    >
      {/* Loading state */}
      <Show when={loading()} fallback={<div />}>
        <div class="flex items-center justify-center py-20 text-[var(--color-text-tertiary)]">
          Loading vessel...
        </div>
      </Show>

      {/* Not found */}
      <Show when={!loading() && !vessel()}>
        <div class="flex flex-col items-center justify-center py-20 gap-4">
          <p class="text-[var(--color-text-secondary)]">Vessel not found.</p>
          <button
            class="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white hover:brightness-110 transition-all"
            onClick={() => navigate("/fleet")}
          >
            Back to Fleet
          </button>
        </div>
      </Show>

      {/* Vessel loaded — no session yet */}
      <Show when={!loading() && !!vessel() && !launchedSessionId()}>
        <div class="space-y-6">
          {/* Vessel info card */}
          <div class="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 space-y-4">
            <div class="flex items-start justify-between">
              <div>
                <h2 class="text-lg font-semibold text-[var(--color-text-primary)]">
                  {vessel()?.display_name || vessel()?.name}
                </h2>
                <p class="text-sm text-[var(--color-text-secondary)] mt-1 font-mono">
                  {vessel()?.path}
                </p>
              </div>
              <span class="text-xs px-2 py-1 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-medium">
                ID: {vessel()?.id}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-[var(--color-text-tertiary)]">Created</span>
                <p class="text-[var(--color-text-secondary)] mt-0.5">
                  {vessel()?.created_at ? new Date(vessel().created_at).toLocaleDateString() : "--"}
                </p>
              </div>
              <div>
                <span class="text-[var(--color-text-tertiary)]">Updated</span>
                <p class="text-[var(--color-text-secondary)] mt-0.5">
                  {vessel()?.updated_at ? new Date(vessel().updated_at).toLocaleDateString() : "--"}
                </p>
              </div>
            </div>

            {/* Launch button */}
            <div class="pt-2 border-t border-[var(--color-border)]">
              <button
                class="w-full px-4 py-3 rounded-xl text-sm font-semibold bg-[var(--color-accent)] text-white hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-[var(--color-accent)]/20"
                onClick={() => setDialogOpen(true)}
              >
                🚀 Launch Session
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Active session view */}
      <Show when={!!launchedSessionId() && tabStore() && ptyStore() && execStore()}>
        <SessionViewContainer
          tabStore={tabStore()!}
          ptyStore={ptyStore()!}
          execStore={execStore()!}
          sessionId={String(launchedSessionId())}
        />
      </Show>

      {/* Launch dialog */}
      <LaunchDialog
        open={dialogOpen()}
        vesselId={vesselId()}
        vesselName={vessel()?.display_name || vessel()?.name || ""}
        onClose={() => setDialogOpen(false)}
        onLaunched={handleLaunched}
      />
    </OverlayLayout>
  );
}
