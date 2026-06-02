/// TabBar — tab switcher between Structured (execution view) and Terminal (PTY).
///
/// Renders a horizontal tab bar with icons, labels, active-state
/// indicators, and unread badge counts. Uses ARIA tablist pattern
/// for accessibility.

import { type Component } from "solid-js";
import type { TabStore } from "../../store/tab-store";
import { TabId } from "../../lib/tab-types";
import "./tab-bar.css";

export interface TabBarProps {
  store: TabStore;
}

/** SVG icon for the Structured tab (list/stack icon). */
function StructuredIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="tab-bar__icon" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

/** SVG icon for the Terminal tab (terminal/console icon). */
function TerminalIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      class="tab-bar__icon" aria-hidden="true">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

export const TabBar: Component<TabBarProps> = (props) => {
  return (
    <div class="tab-bar" role="tablist" data-testid="tab-bar">
      {/* Structured tab */}
      <button
        role="tab"
        aria-selected={props.store.isStructuredActive()}
        aria-controls="structured-panel"
        tabIndex={props.store.isStructuredActive() ? 0 : -1}
        classList={{
          "tab-bar__tab": true,
          "tab-bar__tab--active": props.store.isStructuredActive(),
        }}
        onClick={() => props.store.setActiveTab(TabId.Structured)}
        data-testid="tab-structured"
      >
        <StructuredIcon />
        <span class="tab-bar__label">Structured</span>
        <Show when={props.store.badgeCounts().structured > 0}>
          <span
            class="tab-bar__badge"
            data-testid="tab-badge-structured"
          >
            {props.store.badgeCounts().structured}
          </span>
        </Show>
      </button>

      {/* Terminal tab */}
      <button
        role="tab"
        aria-selected={props.store.isTerminalActive()}
        aria-controls="terminal-panel"
        tabIndex={props.store.isTerminalActive() ? 0 : -1}
        classList={{
          "tab-bar__tab": true,
          "tab-bar__tab--active": props.store.isTerminalActive(),
        }}
        onClick={() => props.store.setActiveTab(TabId.Terminal)}
        data-testid="tab-terminal"
      >
        <TerminalIcon />
        <span class="tab-bar__label">Terminal</span>
        <Show when={props.store.badgeCounts().terminal > 0}>
          <span
            class="tab-bar__badge"
            data-testid="tab-badge-terminal"
          >
            {props.store.badgeCounts().terminal}
          </span>
        </Show>
      </button>

      {/* Active indicator line */}
      <div
        class="tab-bar__indicator"
        data-active-tab={props.store.activeTab()}
      />
    </div>
  );
};
