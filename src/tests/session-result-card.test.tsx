/** @jsxImportSource solid-js */
import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import type { SessionResult, SessionResultCallbacks } from "../lib/execution-types";
import { SessionResultCard } from "../components/execution/SessionResultCard";

// ── Helpers ───────────────────────────────────────────

function successResult(): SessionResult {
  return {
    sessionId: 1,
    status: "Completed",
    exitOutcome: "completed successfully",
    durationMs: 222000, // 3m 42s
    tokensUsed: 15200,
    totalCost: 0.23,
    errorMessage: null,
  };
}

function errorResult(): SessionResult {
  return {
    sessionId: 2,
    status: "Error",
    exitOutcome: "exited with code 1",
    durationMs: 45000,
    tokensUsed: 3200,
    totalCost: 0.05,
    errorMessage: "Session exited with code 1: process crashed",
  };
}

const noop = () => {};
const defaultCallbacks: SessionResultCallbacks = {
  onReviewShip: noop,
  onRetry: noop,
  onDismiss: noop,
};

// ── Tests ──────────────────────────────────────────────

describe("SessionResultCard", () => {
  it("renders success state with checkmark icon", () => {
    render(() => (
      <SessionResultCard result={successResult()} callbacks={defaultCallbacks} />
    ));
    expect(screen.getByTestId("result-icon")).toBeTruthy();
    expect(screen.getByTestId("result-icon").textContent).toContain("✓");
  });

  it("shows duration in mm:ss format for success", () => {
    render(() => (
      <SessionResultCard result={successResult()} callbacks={defaultCallbacks} />
    ));
    // 222000ms = 3m 42s
    const el = screen.getByTestId("result-duration");
    expect(el.textContent).toContain("3:");
    expect(el.textContent).toContain("42");
  });

  it("shows token count and cost for success", () => {
    render(() => (
      <SessionResultCard result={successResult()} callbacks={defaultCallbacks} />
    ));
    expect(screen.getByTestId("result-tokens").textContent).toContain("15.2k");
    expect(screen.getByTestId("result-cost").textContent).toContain("$0.23");
  });

  it("renders error state with X icon", () => {
    render(() => (
      <SessionResultCard result={errorResult()} callbacks={defaultCallbacks} />
    ));
    expect(screen.getByTestId("result-icon")).toBeTruthy();
    expect(screen.getByTestId("result-icon").textContent).toContain("✗");
  });

  it("shows error message when present", () => {
    render(() => (
      <SessionResultCard result={errorResult()} callbacks={defaultCallbacks} />
    ));
    expect(screen.getByTestId("error-message").textContent).toContain("process crashed");
  });

  it("shows all three action buttons", () => {
    render(() => (
      <SessionResultCard result={successResult()} callbacks={defaultCallbacks} />
    ));
    expect(screen.getByRole("button", { name: /review.*ship/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeTruthy();
  });

  it("calls onReviewShip when Review & Ship clicked", async () => {
    let called = false;
    const cb: SessionResultCallbacks = { ...defaultCallbacks, onReviewShip: () => { called = true; } };
    render(() => (
      <SessionResultCard result={successResult()} callbacks={cb} />
    ));
    (screen.getByRole("button", { name: /review.*ship/i }) as HTMLButtonElement).click();
    expect(called).toBe(true);
  });

  it("calls onRetry when Retry clicked", async () => {
    let called = false;
    const cb: SessionResultCallbacks = { ...defaultCallbacks, onRetry: () => { called = true; } };
    render(() => (
      <SessionResultCard result={errorResult()} callbacks={cb} />
    ));
    (screen.getByRole("button", { name: /retry/i }) as HTMLButtonElement).click();
    expect(called).toBe(true);
  });

  it("calls onDismiss when Dismiss clicked", async () => {
    let called = false;
    const cb: SessionResultCallbacks = { ...defaultCallbacks, onDismiss: () => { called = true; } };
    render(() => (
      <SessionResultCard result={successResult()} callbacks={cb} />
    ));
    (screen.getByRole("button", { name: /dismiss/i }) as HTMLButtonElement).click();
    expect(called).toBe(true);
  });
});
