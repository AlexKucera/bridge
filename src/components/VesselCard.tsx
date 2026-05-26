/* VesselCard — A single vessel entry in the fleet sidebar

   Renders as a clickable card with:
   - Left accent bar (colored by status)
   - Status dot (Idle/Running/Warning/Error)
   - Display name
   - Branch name
   - Dirty indicator (dot or icon)
   - Selection glow border when active

   Grid: 24px | 1fr auto  (accent | content row) */

import type { JSX } from "solid-js";

export interface VesselData {
  id: number;
  name: string;
  path: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface VesselCardProps {
  vessel: VesselData;
  status?: "idle" | "running" | "warning" | "error";
  branch?: string;
  dirty?: boolean;
  selected?: boolean;
  onClick?: (vessel: VesselData) => void;
  onContextMenu?: (vessel: VesselData) => void;
}

const STATUS_COLORS: Record<string, string> = {
  idle: "var(--text-muted)",
  running: "var(--color-success)",
  warning: "var(--color-warning)",
  error: "var(--color-danger)",
};

export function VesselCard(props: VesselCardProps) {
  const status = props.status ?? "idle";
  const dirty = props.dirty ?? false;
  const selected = props.selected ?? false;

  const handleClick = () => props.onClick?.(props.vessel);
  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    props.onContextMenu?.(props.vessel);
  };

  return (
    <div
      class={`vessel-card ${selected ? "selected" : ""}`}
      classList={{ "vessel-card--selected": selected }}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      role="button"
      tabIndex={0}
      aria-selected={selected}
      style={{
        "grid-template-columns": "24px 1fr auto",
        gap: "8px",
        "align-items": "center",
        padding: "6px 10px",
        "border-left": `3px solid ${STATUS_COLORS[status] ?? STATUS_COLORS.idle}`,
        background: selected ? "var(--bg-accent)" : "transparent",
        "border-radius": "4px",
        cursor: "pointer",
        transition: "background 0.15s ease",
      }}
    >
      {/* Status dot */}
      <span
        class="vessel-card__status"
        style={{
          width: "8px",
          height: "8px",
          "border-radius": "50%",
          "flex-shrink": "0",
          background: STATUS_COLORS[status] ?? STATUS_COLORS.idle,
        }}
        title={status}
      />

      {/* Name + branch */}
      <div class="vessel-card__info" style={{ "min-width": "0", overflow: "hidden" }}>
        <div class="vessel-card__name" style={{
          "font-size": "13px",
          "font-weight": "500",
          "white-space": "nowrap",
          overflow: "hidden",
          "text-overflow": "ellipsis",
        }}>
          {props.vessel.display_name || props.vessel.name}
        </div>
        {(props.branch) && (
          <div class="vessel-card__branch" style={{
            "font-size": "11px",
            color: "var(--text-muted)",
            "white-space": "nowrap",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}>
            {props.branch}
          </div>
        )}
      </div>

      {/* Dirty indicator */}
      {dirty && (
        <span class="vessel-card__dirty" style={{
          "font-size": "12px",
          "flex-shrink": "0",
          color: "var(--color-warning)",
        }} title="Uncommitted changes">
          ●
        </span>
      )}
    </div>
  );
}
