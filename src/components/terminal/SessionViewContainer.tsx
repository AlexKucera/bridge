/// SessionViewContainer — tab-aware wrapper for Structured + Terminal views.
///
/// Renders a TabBar on top, with PiExecutionPanel (Structured) and
/// CommsDeckPanel (Terminal) below. Shows/hides panels based on the
/// active tab while preserving state in both stores.
///
/// Both panels stay mounted (not unmounted) so their SolidJS reactive
/// state, xterm.js instance, and event listeners persist across switches.

import { type Component } from "solid-js";
import { Show } from "solid-js";
import type { TabStore } from "../../store/tab-store";
import type { PtyStore } from "../../store/pty-store";
import type { PiExecutionStore } from "../../store/pi-store";
import { TabBar } from "./TabBar";
import { CommsDeckPanel } from "./CommsDeckPanel";
import { PiExecutionPanel } from "../execution/PiExecutionPanel";
import "./session-view.css";

export interface SessionViewContainerProps {
  tabStore: TabStore;
  ptyStore: PtyStore;
  execStore: PiExecutionStore;
  sessionId: string;
}

export const SessionViewContainer: Component<SessionViewContainerProps> = (props) => {
  return (
    <div class="session-view" data-testid="session-view">
      {/* Tab bar */}
      <TabBar store={props.tabStore} />

      {/* Structured panel (execution view) */}
      <div
        classList={{
          "session-view__panel": true,
          "session-view__panel--hidden": props.tabStore.isTerminalActive(),
        }}
        id="structured-panel"
        role="tabpanel"
        aria-label="Structured execution view"
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
          "session-view__panel--hidden": props.tabStore.isStructuredActive(),
        }}
        id="terminal-panel"
        role="tabpanel"
        aria-label="Terminal view"
      >
        <CommsDeckPanel
          store={props.ptyStore}
          sessionId={props.sessionId}
        />
      </div>
    </div>
  );
};
