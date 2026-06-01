import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { TurnCard } from "../components/execution/TurnCard";
import type { TurnViewModel } from "../lib/execution-types";
import { ToolCallStatus } from "../lib/execution-types";

function makeTurn(override: Partial<TurnViewModel> = {}): TurnViewModel {
  return {
    id: 0,
    role: "user",
    promptText: "Hello",
    thinkingText: "",
    responseText: "Hi there!",
    toolCalls: [],
    metrics: { tokensUsed: 100, costUsd: 0.001, toolCallCount: 0, durationMs: 500 },
    isCollapsed: false,
    ...override,
  };
}

describe("TurnCard", () => {
  it("renders turn role and index in header", () => {
    render(() => <TurnCard {...makeTurn()} />);
    screen.getByText("Turn 1");
  });

  it("renders user prompt text", () => {
    render(() => <TurnCard {...makeTurn({ role: "user", promptText: "Fix the bug" })} />);
    screen.getByText("Fix the bug");
  });

  it("renders assistant response text via ResponseText slot", () => {
    render(() => (
      <TurnCard {...makeTurn({ role: "assistant", responseText: "Done! Fixed." })} />
    ));
    screen.getByText("Done! Fixed.");
  });

  it("renders ThinkingBubble when thinking text is present", () => {
    render(() => (
      <TurnCard {...makeTurn({ thinkingText: "Let me analyze..." })} />
    ));
    screen.getByTestId("thinking-bubble");
  });

  it("renders ToolCallCards for each tool call in the turn", () => {
    render(() => (
      <TurnCard
        {...makeTurn({
          toolCalls: [
            {
              id: "tc-1",
              toolName: "bash",
              target: "/tmp",
              arguments: {},
              status: ToolCallStatus.Completed,
              durationMs: 50,
              resultPreview: "output",
              rawResult: null,
            },
          ],
        })}
      />
    ));
    screen.getByTestId("tool-call-card");
    screen.getByText("bash");
  });

  it("renders TurnMetricsBar with turn metrics", () => {
    const turn = makeTurn();
    render(() => <TurnCard {...turn} />);
    screen.getByText("100");
    screen.getByText((c) => c.includes("$0.00"));
  });

  it("hides body content when collapsed (shows only header)", () => {
    render(() => (
      <TurnCard
        {...makeTurn({
          isCollapsed: true,
          promptText: "Hidden prompt",
          responseText: "Hidden response",
        })}
      />
    ));
    // Header should still be visible
    screen.getByText("Turn 1");
    // Body content should not be visible when collapsed
    expect(screen.queryByText("Hidden prompt")).toBeNull();
    expect(screen.queryByText("Hidden response")).toBeNull();
  });

  it("fires onToggleCollapse when header is clicked", async () => {
    let toggled = false;
    render(() => (
      <TurnCard
        {...makeTurn()}
        onToggleCollapse={() => { toggled = true; }}
      />
    ));
    const header = screen.getByRole("button");
    await userEvent.click(header);
    expect(toggled).toBe(true);
  });
});
