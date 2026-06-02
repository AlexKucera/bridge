/// Tab types for the Comms Deck tab switcher.
///
/// Defines the two view tabs (Structured / Terminal), badge counting,
/// and session mode detection for default-tab selection.

// ─── Tab Identifier ────────────────────────────────────────────

/** Which tab is currently active in the session view. */
export enum TabId {
  /** Structured execution view (turns, tool calls, metrics). */
  Structured = "Structured",
  /** Interactive PTY terminal (xterm.js). */
  Terminal = "Terminal",
}

// ─── Badge Counts ──────────────────────────────────────────────

/** Unread activity counters per tab. */
export interface TabBadgeCounts {
  structured: number;
  terminal: number;
}

/** Default: no unread activity on either tab. */
export const DEFAULT_TAB_BADGE_COUNTS: TabBadgeCounts = {
  structured: 0,
  terminal: 0,
};

// ─── Session Mode ──────────────────────────────────────────────

/** How a Pi session was launched — determines default tab. */
export type SessionMode = "json" | "pty";

// ─── Tab Store Options ─────────────────────────────────────────

export interface TabStoreOptions {
  /** Session launch mode; "pty" defaults to Terminal tab. */
  defaultMode?: SessionMode;
}
