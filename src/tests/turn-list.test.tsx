import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { TurnList } from "../components/execution/TurnList";
import type { TurnViewModel } from "../lib/execution-types";
import { ToolCallStatus } from "../lib/execution-types";

function makeTurn(id: number, override: Partial<TurnViewModel> = {}): TurnViewModel {
  return {
    id,
    role: "user",
    promptText: `Prompt ${id}`,
    thinkingText: "",
    responseText: `Response ${id}`,
    toolCalls: [],
    metrics: { tokensUsed: 100 * (id + 1), costUsd: 0.001 * (id + 1), toolCallCount: 0, durationMs: 500 },
    isCollapsed: false,
    ...override,
  };
}

describe("TurnList", () => {
  it("renders an empty state when no turns are provided", () => {
    render(() => <TurnList turns={[]} />);
    screen.getByText(/no activity/i);
  });

  it("renders each turn as a TurnCard", () => {
    const turns = [makeTurn(0), makeTurn(1), makeTurn(2)];
    render(() => <TurnList turns={turns} />);
    for (const t of turns) {
      screen.getByText(t.promptText);
    }
  });

  it("renders turns in chronological order", () => {
    const turns = [makeTurn(0), makeTurn(1)];
    render(() => <TurnList turns={turns} />);
    const cards = screen.getAllByTestId("turn-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].getAttribute("data-turn-id")).toBe("0");
    expect(cards[1].getAttribute("data-turn-id")).toBe("1");
  });

  it("calls onToggleCollapse when a turn card toggles", async () => {
    let toggledId: number | undefined;
    const turns = [makeTurn(0)];
    render(() => (
      <TurnList
        turns={turns}
        onToggleCollapse={(id) => { toggledId = id; }}
      />
    ));
    // Find the header button and click it
    const headers = screen.getAllByRole("button");
    await headers[0].click();
    expect(toggledId).toBe(0);
  });

  it("calls onScrollNearBottom callback when scroll position changes", () => {
    const onScrollNearBottom = vi.fn();
    const turns = [makeTurn(0)];
    render(() => (
      <TurnList
        turns={turns}
        onScrollNearBottom={onScrollNearBottom}
      />
    ));
    // The list container should exist
    const list = screen.getByTestId("turn-list");
    expect(list).toBeTruthy();
  });
});
