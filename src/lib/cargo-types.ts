/// Cargo Panel types — mirrors Rust cargo module types for the frontend.

// ── Status Types ───────────────────────────────────────

export type ChangeType = "added" | "modified" | "deleted" | "renamed";
export type StagingStatus = "staged" | "unstaged";

export interface StatusFile {
  path: string;
  changeType: ChangeType;
  staging: StagingStatus;
}

export interface StatusResult {
  isClean: boolean;
  hasConflicts: boolean;
  mergeInProgress: boolean;
  branchName: string | null;
  files: StatusFile[];
}

// ── Diff Types ─────────────────────────────────────────

export interface DiffSummary {
  added: number;
  modified: number;
  deleted: number;
}

export interface FileDiff {
  path: string;
  changeType: ChangeType;
  status: StagingStatus;
  additions: number;
  deletions: number;
  snippet: string;
}

export interface DiffResult {
  summary: DiffSummary;
  files: FileDiff[];
}

// ── Commit/Push Types ──────────────────────────────────

export interface CommitResult {
  hash: string;
  timestamp: string;
}

export interface PushResult {
  success: boolean;
  message: string;
}

// ── Commit Message Generator Context ───────────────────

export interface SessionContext {
  prompt?: string;
  filesChanged: string[];
  skillInvoked?: string;
}

// ── UI State ───────────────────────────────────────────

export interface CargoPanelState {
  /** Current vessel path being inspected */
  vesselPath: string | null;
  /** Status result */
  status: StatusResult | null;
  /** Diff result */
  diff: DiffResult | null;
  /** Currently selected file path for diff viewer */
  selectedFilePath: string | null;
  /** Commit message text */
  commitMessage: string;
  /** Whether a commit/push operation is in progress */
  isCommitting: boolean;
  /** Error message to display */
  error: string | null;
  /** Success message to display (toast) */
  successMessage: string | null;
}

// ── Helpers ─────────────────────────────────────────────

/** Get icon character for a change type */
export function changeTypeIcon(type_: ChangeType): string {
  switch (type_) {
    case "added": return "+";
    case "modified": return "~";
    case "deleted": return "-";
    case "renamed": return "→";
  }
}

/** Get CSS color class for a change type */
export function changeTypeColor(type_: ChangeType): string {
  switch (type_) {
    case "added": return "cargo-green";
    case "modified": return "cargo-amber";
    case "deleted": return "cargo-red";
    case "renamed": return "cargo-blue";
  }
}
