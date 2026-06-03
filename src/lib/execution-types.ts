/// Execution view model types — mirrors Rust pi_state module.
/// These are the TypeScript representations of the view models
/// produced by the Rust state machine and sent to the frontend
/// via Tauri events.

// ─── LiveState ──────────────────────────────────────────────

/** Status of a live Pi session. Mirrors Rust `LiveState`. */
export enum LiveState {
  Queued = "Queued",
  Starting = "Starting",
  Idle = "Idle",
  Thinking = "Thinking",
  RunningTool = "RunningTool",
  StreamingText = "StreamingText",
  Done = "Done",
  Error = "Error",
  Stopped = "Stopped",
}

// ─── ToolCallStatus ─────────────────────────────────────────

/** Lifecycle status of a tool call. Mirrors Rust `ToolCallStatus`. */
export enum ToolCallStatus {
  Invoking = "Invoking",
  Streaming = "Streaming",
  AwaitingResult = "AwaitingResult",
  Completed = "Completed",
  Failed = "Failed",
}

// ─── TurnMetrics ────────────────────────────────────────────

/** Metrics accumulated per turn or session. Mirrors Rust `TurnMetrics`. */
export interface TurnMetrics {
  tokensUsed: number;
  costUsd: number;
  toolCallCount: number;
  durationMs: number;
}

// ─── ToolCallViewModel ──────────────────────────────────────

/** A tool call within a turn, as seen in the execution view. */
export interface ToolCallViewModel {
  id: string;
  toolName: string;
  target: string;
  arguments: Record<string, unknown>;
  status: ToolCallStatus;
  durationMs: number;
  resultPreview: string;
  rawResult: Record<string, unknown> | null;
}

// ─── TurnViewModel ──────────────────────────────────────────

/** A single conversation turn (user prompt → assistant response). */
export interface TurnViewModel {
  id: number;
  role: string;
  promptText: string;
  thinkingText: string;
  responseText: string;
  toolCalls: ToolCallViewModel[];
  metrics: TurnMetrics;
  isCollapsed: boolean;
}

// ─── ExecutionViewModel ─────────────────────────────────────

/** Top-level view model for a Pi execution session. */
export interface ExecutionViewModel {
  sessionId: string;
  modelName: string;
  provider: string;
  thinkingLevel: string;
  status: LiveState;
  startedAt?: string;
  elapsedMs: number;
  totalTokens: number;
  totalCost: number;
  turns: TurnViewModel[];
  unknownEvents: Record<string, unknown>[];
}

// ─── UI Prefs ───────────────────────────────────────────────

/** User preferences for the execution view UI. */
export interface UiPrefs {
  compact: boolean;
  fontSize: number;
  showThinking: boolean;
}

/** Default UI preferences. */
export const DEFAULT_UI_PREFS: UiPrefs = {
  compact: false,
  fontSize: 14,
  showThinking: true,
};

// ─── Session Result ──────────────────────────────────────

/** Result of a finalized Pi session. Mirrors Rust `SessionFinalizeResult`. */
export interface SessionResult {
  sessionId: number;
  status: "Completed" | "Error" | "Stopped";
  exitOutcome: string;
  durationMs: number;
  tokensUsed: number;
  totalCost: number;
  errorMessage: string | null;
}

/** Callbacks for SessionResultCard actions. */
export interface SessionResultCallbacks {
  onReviewShip: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}
