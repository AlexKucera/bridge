/// Terminal / PTY types for the Comms Deck.
///
/// Defines the TypeScript representations of PTY events,
/// terminal state, and color-coding rules for log output.

// ─── PTY Output Event ──────────────────────────────────────────

/** Payload received from Tauri on the 'pty-output' channel. */
export interface PtyOutputEvent {
  /** Session ID this output belongs to */
  sessionId: string;
  /** Raw bytes from the PTY stdout, base64-encoded for JSON transport */
  data: string;
  /** Timestamp when the chunk was emitted (ISO 8601) */
  timestamp: string;
}

// ─── Terminal State ─────────────────────────────────────────────

/** Current lifecycle state of the terminal panel. */
export enum TerminalStatus {
  /** Terminal not yet connected to a session */
  Disconnected = "Disconnected",
  /** Connecting / waiting for first PTY output */
  Connecting = "Connecting",
  /** Active — receiving output, accepting input */
  Connected = "Connected",
  /** Session ended (child process exited) */
  Exited = "Exited",
  /** Error state (PTY failure, connection lost) */
  Error = "Error",
}

/** Color classification for terminal output lines. */
export enum LogLineClass {
  Prompt = "prompt",
  Info = "info",
  Warn = "warn",
  Error = "error",
  Dim = "dim",
  Plain = "plain",
}

/** Configuration for the CommsDeckPanel terminal. */
export interface TerminalConfig {
  /** Font size in pixels (default: 14) */
  fontSize: number;
  /** Font family (default: 'Menlo', 'Monaco', 'Courier New', monospace) */
  fontFamily: string;
  /** Number of columns (default: 80) */
  cols: number;
  /** Number of rows (default: 24) */
  rows: number;
  /** Whether scan-line overlay is visible */
  showScanLines: boolean;
  /** Whether cursor blink is enabled */
  cursorBlink: boolean;
  /** Theme: 'dark' or 'light' */
  theme: "dark" | "light";
}

/** Default terminal configuration. */
export const DEFAULT_TERMINAL_CONFIG: TerminalConfig = {
  fontSize: 14,
  fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
  cols: 80,
  rows: 30,
  showScanLines: true,
  cursorBlink: true,
  theme: "dark",
};

/** Reactive state for the PTY terminal. */
export interface TerminalState {
  status: TerminalStatus;
  config: TerminalConfig;
  /** Accumulated raw output (for search / replay) */
  outputBuffer: string;
  /** Exit code if session has ended */
  exitCode: number | null;
  /** Error message if in error state */
  errorMessage: string | null;
}
