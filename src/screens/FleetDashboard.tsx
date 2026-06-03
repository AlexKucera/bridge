/* FleetDashboard — Full-page fleet overview with built-in chrome.
 *
 * Layout (self-contained, no OverlayLayout wrapper):
 *   Top bar: title + main nav links
 *   Below: 180px vessel sidebar | fluid content | 280px activity feed
 *
 * State:
 *   - vessels: fetched via vessel_list_with_git
 *   - dialogOpen / dialogError: controls AddVesselDialog modal
 *   - selectedId: tracks clicked vessel for highlight + navigation */

import { createSignal, onMount } from "solid-js";
import { useNavigate, useLocation } from "@solidjs/router";
import { invoke } from "@tauri-apps/api/core";
import { VesselCard } from "../components/VesselCard";
import type { VesselData } from "../components/VesselCard";
import { AddVesselDialog } from "../components/AddVesselDialog";

interface VesselWithGit {
  id: number;
  name: string;
  path: string;
  display_name: string | null;
  branch: string | null;
  dirty: boolean;
}

const MAIN_NAV = [
  { href: "/fleet", label: "⚓ FLEET" },
  { href: "/charts", label: "📊 CHARTS" },
  { href: "/log", label: "📜 LOG" },
  { href: "/helm", label: "🧭 HELM" },
  { href: "/", label: "🏠 WELCOME" },
] as const;

export function FleetDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [vessels, setVessels] = createSignal<VesselWithGit[]>([]);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [dialogOpen, setDialogOpen] = createSignal(false);
  const [dialogError, setDialogError] = createSignal<string>("");

  const handleVesselClick = (vessel: VesselData) => {
    setSelectedId(vessel.id);
    navigate(`/vessel/${vessel.id}`);
  };

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
      const msg = e?.message
        || (typeof e === "string" ? e : null)
        || (e ? JSON.stringify(e) : null)
        || "Failed to add vessel";
      console.error("vessel_add failed:", e);
      setDialogError(msg);
    }
  }

  return (
    <div class="fleet-page" style={{
      height: "100vh",
      display: "flex",
      "flex-direction": "column",
      background: "var(--bg)",
      color: "var(--text)",
    }}>
      {/* ── Top bar ──────────────────────────────── */}
      <header style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "space-between",
        padding: "12px 20px",
        "border-bottom": "1px solid var(--border)",
        "flex-shrink": "0",
      }}>
        <div>
          <h1 style={{ margin: 0, "font-size": "16px", "font-weight": "600" }}>
            BRIDGE <span style={{ "font-weight": "400", "color": "var(--text-muted)" }}>MISSION CONTROL</span>
          </h1>
        </div>
        <nav style={{ display: "flex", gap: "4px" }}>
          {MAIN_NAV.map((item) => (
            <a
              href={item.href}
              style={{
                padding: "6px 12px",
                "font-size": "12px",
                "font-weight": "500",
                "text-decoration": "none",
                "border-radius": "6px",
                color: location.pathname === item.href
                  ? "var(--text)"
                  : "var(--text-secondary)",
                background: location.pathname === item.href
                  ? "var(--bg-secondary)"
                  : "transparent",
              }}
              onClick={(e) => { e.preventDefault(); navigate(item.href); }}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div style={{ "font-size": "11px", color: "var(--text-muted)" }}>
          v0.1
        </div>
      </header>

      {/* ── Subtitle bar ─────────────────────────── */}
      <div style={{
        padding: "8px 20px",
        "font-size": "13px",
        color: "var(--text-secondary)",
        "border-bottom": "1px solid var(--border)",
        "flex-shrink": "0",
      }}>
        Monitor all vessels, status, and active missions
      </div>

      {/* ── 3-column body ───────────────────────── */}
      <div style={{
        display: "grid",
        "grid-template-columns": "200px 1fr 260px",
        flex: "1",
        overflow: "hidden",
      }}>
        {/* Left: Vessel sidebar */}
        <aside style={{
          "overflow-y": "auto",
          "border-right": "1px solid var(--border)",
          background: "var(--bg-secondary)",
          display: "flex",
          "flex-direction": "column",
        }}>
          {/* Sidebar header */}
          <div style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "space-between",
            padding: "10px 12px",
            "flex-shrink": "0",
          }}>
            <span style={{ "font-size": "11px", "text-transform": "uppercase", "letter-spacing": "0.05em", color: "var(--text-muted)", "font-weight": "600" }}>
              Vessels
            </span>
            <button
              onClick={() => setDialogOpen(true)}
              style={{
                padding: "2px 8px",
                "font-size": "11px",
                "font-weight": "600",
                border: "1px solid var(--color-primary)",
                color: "var(--color-primary)",
                background: "transparent",
                "border-radius": "4px",
                cursor: "pointer",
              }}
            >
              + Add
            </button>
          </div>

          {/* Vessel card list */}
          {vessels().length === 0 ? (
            <p style={{ padding: "10px 12px", "font-size": "12px", color: "var(--text-muted)" }}>
              No vessels added yet.
            </p>
          ) : (
            <div style={{ display: "flex", "flex-direction": "column" }}>
              {vessels().map((v) => (
                <VesselCard
                  key={v.id}
                  vessel={{ id: v.id, name: v.display_name || v.name, path: v.path }}
                  branch={v.branch ?? undefined}
                  dirty={v.dirty}
                  selected={selectedId() === v.id}
                  onClick={handleVesselClick}
                />
              ))}
            </div>
          )}
        </aside>

        {/* Center: Content area */}
        <main style={{
          "overflow-y": "auto",
          padding: "20px",
          display: "flex",
          "align-items": "center",
          "justify-content": "center",
        }}>
          <div style={{ "text-align": "center", color: "var(--text-muted)" }}>
            <p style={{ "font-size": "16px", "margin-bottom": "4px" }}>No vessel selected</p>
            <p style={{ "font-size": "13px" }}>Add a vessel to get started, or select one from the sidebar.</p>
          </div>
        </main>

        {/* Right: Activity feed placeholder */}
        <aside style={{
          "overflow-y": "auto",
          "border-left": "1px solid var(--border)",
          background: "var(--bg-secondary)",
        }}>
          <p style={{ padding: "10px 12px", "font-size": "11px", "text-transform": "uppercase", "letter-spacing": "0.05em", color: "var(--text-muted)", "font-weight": "600" }}>
            Activity
          </p>
          <p style={{ padding: "10px 12px", "font-size": "12px", color: "var(--text-muted)" }}>
            Activity feed coming soon.
          </p>
        </aside>
      </div>

      {/* Status bar */}
      <footer style={{
        padding: "4px 20px",
        "font-size": "11px",
        color: "var(--text-muted)",
        "border-top": "1px solid var(--border)",
        "text-align": "right",
        "flex-shrink": "0",
      }}>
        ● All systems nominal
      </footer>

      {/* Add Vessel Dialog */}
      <AddVesselDialog
        open={dialogOpen()}
        onClose={() => { setDialogOpen(false); setDialogError(""); }}
        onSubmit={handleAddVessel}
        error={dialogError() || undefined}
      />
    </div>
  );
}
