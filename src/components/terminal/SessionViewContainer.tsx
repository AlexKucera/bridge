/// SessionViewContainer — tab-aware wrapper for Structured + Terminal + Cargo views.
///
/// Renders a TabBar on top, with PiExecutionPanel (Structured),
/// CommsDeckPanel (Terminal), and CargoPanel (Git) below.
/// Shows/hides panels based on the active tab while preserving
/// state in all stores.

import { createEffect } from "solid-js";
import { type Component } from "solid-js";
import type { TabStore } from "../../store/tab-store";
import type { PtyStore } from "../../store/pty-store";
import type { PiExecutionStore } from "../../store/pi-store";
import { TabBar } from "./TabBar";
import { CommsDeckPanel } from "./CommsDeckPanel";
import { PiExecutionPanel } from "../execution/PiExecutionPanel";
import CargoPanel from "../cargo/CargoPanel";
import { createCargoStore } from "../../store/cargo-store";
import type { CargoStore } from "../../store/cargo-store";
import "./session-view.css";
import "../cargo/cargo.css";

export interface SessionViewContainerProps {
  tabStore: TabStore;
  ptyStore: PtyStore;
  execStore: PiExecutionStore;
  sessionId: string;
  /** Filesystem path of the vessel's git repo — used by Cargo Panel */
  vesselPath?: string;
}

export const SessionViewContainer: Component<SessionViewContainerProps> = (props) => {
  // ── Cargo store (always created; persists across tab switches) ──
  const cargoStore = createCargoStore();

  // Set vessel path when available (reactive)
  createEffect(() => {
    if (props.vesselPath) {
      cargoStore.setVesselPath(props.vesselPath);
    }
  });

  // Auto-fetch status+diff when Cargo tab becomes active
  createEffect(() => {
    if (props.tabStore.isCargoActive() && cargoStore.vesselPath()) {
      cargoStore.refresh(cargoStore.vesselPath()!);
    }
  });

  return (
    <div class="session-view" data-testid="session-view">
      {/* Tab bar */}
      <TabBar store={props.tabStore} />

      {/* Structured panel (execution view) */}
      <div
        classList={{
          "session-view__panel": true,
          "session-view__panel--hidden": props.tabStore.isTerminalActive() || props.tabStore.isCargoActive(),
        }}
        id="structured-panel"
        role="tabpanel"
        aria-label="Structured execution view"
        aria-hidden={props.tabStore.isTerminalActive() || props.tabStore.isCargoActive()}
      >
        <PiExecutionPanel
          store={props.execStore}
          sessionId={props.sessionId}
        />
      </div>

      {/* Terminal panel (PTY) */}
      <div
        classList={{
          "session-view__panel": true,
          "session-view__panel--hidden": props.tabStore.isStructuredActive() || props.tabStore.isCargoActive(),
        }}
        id="terminal-panel"
        role="tabpanel"
        aria-label="Terminal view"
        aria-hidden={props.tabStore.isStructuredActive() || props.tabStore.isCargoActive()}
      >
        <CommsDeckPanel
          store={props.ptyStore}
          sessionId={props.sessionId}
        />
      </div>

      {/* Cargo panel (Git diff / commit / ship) */}
      <div
        classList={{
          "session-view__panel": true,
          "session-view__panel--hidden": !props.tabStore.isCargoActive(),
        }}
        id="cargo-panel"
        role="tabpanel"
        aria-label="Cargo — Git operations"
        aria-hidden={!props.tabStore.isCargoActive()}
      >
        <CargoPanel store={cargoStore} />
      </div>
    </div>
  );
};
