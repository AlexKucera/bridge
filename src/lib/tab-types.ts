/// Tab types for the Comms Deck tab switcher.
///
/// Defines the three view tabs (Structured / Terminal / Cargo), badge counting,
/// and session mode detection for default-tab selection.

// ─── Tab Identifier ────────────────────────────────────────────

/** Which tab is currently active in the session view. */
export enum TabId {
  /** Structured execution view (turns, tool calls, metrics). */
  Structured = "Structured",
  /** Interactive PTY terminal (xterm.js). */
  Terminal = "Terminal",
  /** Git diff review and commit/ship interface (Cargo Panel). */
  Cargo = "Cargo",
}

// ─── Badge Counts ──────────────────────────────────────────────

/** Unread activity counters per tab. */
export interface TabBadgeCounts {
  structured: number;
  terminal: number;
  cargo: number;
}

/** Default: no unread activity on any tab. */
export const DEFAULT_TAB_BADGE_COUNTS: TabBadgeCounts = {
  structured: 0,
  terminal: 0,
  cargo: 0,
};

// ─── Session Mode ──────────────────────────────────────────────

/** How a Pi session was launched — determines default tab. */
export type SessionMode = "json" | "pty";

/** Helper: map TabId to its badge-count key. */
export function tabBadgeKey(tab: TabId): keyof TabBadgeCounts {
  switch (tab) {
    case TabId.Structured:
      return "structured";
    case TabId.Terminal:
      return "terminal";
    case TabId.Cargo:
      return "cargo";
  }
}

// ─── Tab Store Options ─────────────────────────────────────────

export interface TabStoreOptions {
  /** Session launch mode; "pty" defaults to Terminal tab. */
  defaultMode?: SessionMode;
}
