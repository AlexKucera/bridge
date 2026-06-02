import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { LiveIndicator } from "../components/execution/LiveIndicator";
import { LiveState } from "../lib/execution-types";

describe("LiveIndicator", () => {
  it("renders the current phase label from LiveState", () => {
    render(() => <LiveIndicator status={LiveState.Thinking} />);
    screen.getByText("Thinking");
  });

  it("renders Done state label", () => {
    render(() => <LiveIndicator status={LiveState.Done} />);
    screen.getByText("Done");
  });

  it("renders RunningTool state label", () => {
    render(() => <LiveIndicator status={LiveState.RunningTool} />);
    screen.getByText("RunningTool");
  });

  it("applies --active CSS class for Thinking state", () => {
    render(() => <LiveIndicator status={LiveState.Thinking} />);
    const el = screen.getByTestId("live-indicator");
    expect(el.classList.contains("live-indicator--active")).toBe(true);
  });

  it("applies --done CSS class for Done state", () => {
    render(() => <LiveIndicator status={LiveState.Done} />);
    const el = screen.getByTestId("live-indicator");
    expect(el.classList.contains("live-indicator--done")).toBe(true);
  });

  it("applies --error CSS class for Error state", () => {
    render(() => <LiveIndicator status={LiveState.Error} />);
    const el = screen.getByTestId("live-indicator");
    expect(el.classList.contains("live-indicator--error")).toBe(true);
  });

  it("applies --idle CSS class for Idle state", () => {
    render(() => <LiveIndicator status={LiveState.Idle} />);
    const el = screen.getByTestId("live-indicator");
    expect(el.classList.contains("live-indicator--idle")).toBe(true);
  });

  it("applies --active CSS class for StreamingText state", () => {
    render(() => <LiveIndicator status={LiveState.StreamingText} />);
    const el = screen.getByTestId("live-indicator");
    expect(el.classList.contains("live-indicator--active")).toBe(true);
  });
});
