/// SessionResultCard — post-session result display with actions.
///
/// Shows success/error status, metrics (duration, tokens, cost),
/// error details, and action buttons (Review & Ship, Retry, Dismiss).
/// Appears in Execution View when a session reaches a terminal state.

import type { Component } from "solid-js";
import type { SessionResult, SessionResultCallbacks } from "../../lib/execution-types";

// ─── Helpers ──────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${String(mins).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatCost(c: number): string {
  return `$${c.toFixed(2)}`;
}

// ─── Props ────────────────────────────────────────────

export interface SessionResultCardProps {
  result: SessionResult;
  callbacks: SessionResultCallbacks;
}

// ─── Component ────────────────────────────────────────

export const SessionResultCard: Component<SessionResultCardProps> = (props) => {
  const r = props.result;
  const isCompleted = () => r.status === "Completed";

  return (
    <div
      class="session-result-card"
      data-testid="session-result-card"
      role="region"
      aria-label="Session result"
    >
      {/* Status icon + summary line */}
      <div class={`session-result-card__header session-result-card__header--${isCompleted() ? "success" : "error"}`}>
        <span
          class="session-result-card__icon"
          data-testid="result-icon"
          role="img"
          aria-label={isCompleted() ? "Success" : "Failed"}
        >
          {isCompleted() ? "✓" : "✗"}
        </span>
        <span class="session-result-card__summary">
          {isCompleted()
            ? `Completed in ${formatDuration(r.durationMs)} · ${formatTokens(r.tokensUsed)} tokens · ${formatCost(r.totalCost)}`
            : `Failed · ${r.exitOutcome} · ${formatDuration(r.durationMs)}`
          }
        </span>
      </div>

      {/* Error message block */}
      {!isCompleted() && r.errorMessage && (
        <div class="session-result-card__error" data-testid="error-message">
          {r.errorMessage}
        </div>
      )}

      {/* Metrics detail row */}
      <div class="session-result-card__metrics">
        <span data-testid="result-duration">⏱ {formatDuration(r.durationMs)}</span>
        <span data-testid="result-tokens">🔤 {formatTokens(r.tokensUsed)}</span>
        <span data-testid="result-cost">💰 {formatCost(r.totalCost)}</span>
      </div>

      {/* Action buttons */}
      <div class="session-result-card__actions">
        <button
          class="session-result-card__btn session-result-card__btn--primary"
          data-testid="btn-review-ship"
          onClick={() => props.callbacks.onReviewShip()}
        >
          Review & Ship →
        </button>
        <button
          class="session-result-card__btn session-result-card__btn--secondary"
          data-testid="btn-retry"
          onClick={() => props.callbacks.onRetry()}
        >
          ↻ Retry
        </button>
        <button
          class="session-result-card__btn session-result-card__btn--ghost"
          data-testid="btn-dismiss"
          onClick={() => props.callbacks.onDismiss()}
        >
          ✕ Dismiss
        </button>
      </div>
    </div>
  );
};
