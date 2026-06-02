import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { ToolCallCard } from "../components/execution/ToolCallCard";
import { ToolCallStatus } from "../lib/execution-types";

function makeToolCall(override: Partial<ConstructorParameters<typeof ToolCallCard>[0]> = {}) {
  return {
    id: "tc-1",
    toolName: "bash",
    target: "/tmp",
    arguments: {},
    status: ToolCallStatus.Invoking as const,
    durationMs: 0,
    resultPreview: "",
    rawResult: null,
    ...override,
  };
}

describe("ToolCallCard", () => {
  it("renders tool name in monospace badge", () => {
    render(() => <ToolCallCard {...makeToolCall()} />);
    screen.getByText("bash");
  });

  it("renders Invoking state with spinner indicator", () => {
    render(() => <ToolCallCard {...makeToolCall({ status: ToolCallStatus.Invoking })} />);
    screen.getByTestId("tool-status-invoking");
  });

  it("renders Streaming state with progress indicator", () => {
    render(() => <ToolCallCard {...makeToolCall({ status: ToolCallStatus.Streaming })} />);
    screen.getByTestId("tool-status-streaming");
  });

  it("renders AwaitingResult state with hourglass indicator", () => {
    render(() => <ToolCallCard {...makeToolCall({ status: ToolCallStatus.AwaitingResult })} />);
    screen.getByTestId("tool-status-awaiting");
  });

  it("renders Completed state with checkmark and duration", () => {
    render(() => (
      <ToolCallCard
        {...makeToolCall({
          status: ToolCallStatus.Completed,
          durationMs: 1234,
          resultPreview: "file1.txt\nfile2.txt",
        })}
      />
    ));
    screen.getByTestId("tool-status-completed");
    screen.getByText((c) => c.includes("1.2s"));
    screen.getByText((c) => c.includes("file1.txt"));
  });

  it("renders Failed state with X and error preview", () => {
    render(() => (
      <ToolCallCard
        {...makeToolCall({
          status: ToolCallStatus.Failed,
          resultPreview: "Command not found: xyz",
        })}
      />
    ));
    screen.getByTestId("tool-status-failed");
    screen.getByText("Command not found: xyz");
  });

  it("renders target/arguments preview area", () => {
    render(() => (
      <ToolCallCard
        {...makeToolCall({
          toolName: "read",
          target: "/src/main.ts",
          arguments: { path: "/src/main.ts" },
        })}
      />
    ));
    screen.getByText("/src/main.ts");
  });

  // ─── Animations (Slice 8) ────────────────────────────

  it("applies --active CSS class for Invoking state", () => {
    render(() => (
      <ToolCallCard {...makeToolCall({ status: ToolCallStatus.Invoking })} />
    ));
    const el = screen.getByTestId("tool-call-card");
    expect(el.classList.contains("tool-call--active")).toBe(true);
  });

  it("applies --active CSS class for Streaming state", () => {
    render(() => (
      <ToolCallCard {...makeToolCall({ status: ToolCallStatus.Streaming })} />
    ));
    const el = screen.getByTestId("tool-call-card");
    expect(el.classList.contains("tool-call--active")).toBe(true);
  });

  it("applies --completed CSS class for Completed state", () => {
    render(() => (
      <ToolCallCard {...makeToolCall({ status: ToolCallStatus.Completed, durationMs: 500 })} />
    ));
    const el = screen.getByTestId("tool-call-card");
    expect(el.classList.contains("tool-call--completed")).toBe(true);
  });

  it("applies --failed CSS class for Failed state", () => {
    render(() => (
      <ToolCallCard {...makeToolCall({ status: ToolCallStatus.Failed })} />
    ));
    const el = screen.getByTestId("tool-call-card");
    expect(el.classList.contains("tool-call--failed")).toBe(true);
  });

  it("renders progress sweep element for active states", () => {
    render(() => (
      <ToolCallCard {...makeToolCall({ status: ToolCallStatus.Invoking })} />
    ));
    screen.getByTestId("tool-progress-sweep");
  });

  it("does not render progress sweep for Completed state", () => {
    render(() => (
      <ToolCallCard {...makeToolCall({ status: ToolCallStatus.Completed, durationMs: 500 })} />
    ));
    expect(screen.queryByTestId("tool-progress-sweep")).toBeNull();
  });

  it("renders live duration for active states", () => {
    render(() => (
      <ToolCallCard {...makeToolCall({ status: ToolCallStatus.Invoking, durationMs: 2500 })} />
    ));
    screen.getByText((c) => c.includes("2.5s"));
  });
});
