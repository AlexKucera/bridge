/// SessionActionBar — toolbar with terminal toggle and export actions.
///
/// Provides:
/// - "Raw Terminal" toggle: switches to xterm.js rendering (shell for #11)
/// - "Export" dropdown: Copy as JSON, Copy as Markdown, Save to file

import type { Component } from "solid-js";
import { createSignal } from "solid-js";

export interface SessionActionBarProps {
  /** Called when raw terminal toggle is flipped. */
  onToggleTerminal?: () => void;
  /** Whether terminal view is currently active. */
  isTerminalView?: boolean;
  /** Export session as JSON string (for clipboard). */
  onExportJson?: () => void;
  /** Export session as Markdown string (for clipboard). */
  onExportMarkdown?: () => void;
  /** Save session to file. */
  onSaveFile?: () => void;
}

export const SessionActionBar: Component<SessionActionBarProps> = (props) => {
  const [exportOpen, setExportOpen] = createSignal(false);

  const handleExportToggle = () => {
    setExportOpen(!exportOpen());
  };

  const closeExport = () => {
    setExportOpen(false);
  };

  return (
    <div class="session-action-bar" data-testid="session-action-bar">
      {/* Raw Terminal Toggle */}
      <button
        class={`action-btn${props.isTerminalView ? " action-btn--active" : ""}`}
        onClick={props.onToggleTerminal}
        data-testid="terminal-toggle"
        type="button"
        aria-pressed={props.isTerminalView}
        title="Toggle raw terminal view (xterm.js)"
      >
        <span aria-hidden="true">🖥</span>
        Raw Terminal
      </button>

      {/* Export Dropdown */}
      <div class="action-dropdown" data-testid="export-dropdown">
        <button
          class="action-btn action-btn--export"
          onClick={handleExportToggle}
          aria-expanded={exportOpen()}
          aria-haspopup="menu"
          type="button"
          title="Export session"
        >
          <span aria-hidden="true">📋</span>
          Export ▾
        </button>

        {exportOpen() && (
          <div class="action-dropdown__menu" role="menu" aria-label="Export options">
            <button
              class="action-dropdown__item"
              role="menuitem"
              onClick={() => { props.onExportJson?.(); closeExport(); }}
            >
              📄 Copy JSON
            </button>
            <button
              class="action-dropdown__item"
              role="menuitem"
              onClick={() => { props.onExportMarkdown?.(); closeExport(); }}
            >
              📝 Copy Markdown
            </button>
            <hr class="action-dropdown__divider" />
            <button
              class="action-dropdown__item"
              role="menuitem"
              onClick={() => { props.onSaveFile?.(); closeExport(); }}
            >
              💾 Save to File
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
