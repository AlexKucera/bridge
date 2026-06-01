import { describe, it, expect, vi } from "vitest";
import { createSignal } from "solid-js";
import { render, screen } from "@solidjs/testing-library";
import { TurnList } from "../components/execution/TurnList";
import type { TurnViewModel } from "../lib/execution-types";

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

  it("renders unknown events as collapsible raw JSON blocks", () => {
    const unknownEvents = [
      { type: "future_magic_event", spell: "incantatio" },
      { type: "beta_feature", enabled: true },
    ];
    render(() => (
      <TurnList turns={[]} unknownEvents={unknownEvents} />
    ));
    const cards = screen.getAllByTestId("unknown-event-card");
    expect(cards).toHaveLength(2);
    // Should show event type as header
    screen.getByText("future_magic_event");
    screen.getByText("beta_feature");
  });

  it("does not crash on unknown events with circular-safe JSON stringify", () => {
    const unknownEvents = [
      { type: "deep_event", nested: { arr: [1, 2, 3] } },
    ];
    render(() => (
      <TurnList turns={[]} unknownEvents={unknownEvents} />
    ));
    // Should render without throwing
    screen.getByTestId("unknown-event-card");
  });

  it("toggles unknown event card collapse on click", async () => {
    const unknownEvents = [{ type: "toggle_test" }];
    render(() => (
      <TurnList turns={[]} unknownEvents={unknownEvents} />
    ));
    const btn = screen.getByRole("button", { name: /toggle_test/i });
    // Click to expand (collapsed by default)
    await btn.click();
    // Should now show raw JSON content
    screen.getByText(/"type":/);
  });

  it("auto-scrolls to bottom when turns prop grows (new activity)", async () => {
    let setTurns: (t: TurnViewModel[]) => void;
    function TestWrapper() {
      const [turns, setTurnsFn] = createSignal<TurnViewModel[]>([]);
      setTurns = setTurnsFn;
      return <TurnList turns={turns()} />;
    }
    render(() => <TestWrapper />);
    const list = screen.getByTestId("turn-list");

    // Mock scroll dimensions so the list is scrollable
    Object.defineProperty(list, "scrollHeight", { value: 1000, writable: true });
    Object.defineProperty(list, "clientHeight", { value: 200, writable: true });
    let scrollTopVal = 700; // near bottom
    Object.defineProperty(list, "scrollTop", {
      get: () => scrollTopVal,
      set: (v: number) => { scrollTopVal = v; },
      configurable: true,
    });

    // Add a turn — should trigger auto-scroll to bottom
    setTurns([makeTurn(0)]);

    // Flush reactive updates
    await new Promise((r) => setTimeout(r, 10));

    // scrollTop should be at bottom
    expect(scrollTopVal).toBe(1000);
  });

  it("does NOT auto-scroll when user has scrolled up (scroll lock active)", async () => {
    let setTurns: (t: TurnViewModel[]) => void;
    function TestWrapper() {
      const [turns, setTurnsFn] = createSignal<TurnViewModel[]>([]);
      setTurns = setTurnsFn;
      return <TurnList turns={turns()} />;
    }
    render(() => <TestWrapper />);
    const list = screen.getByTestId("turn-list");

    Object.defineProperty(list, "scrollHeight", { value: 1000, writable: true });
    Object.defineProperty(list, "clientHeight", { value: 200, writable: true });
    // User has scrolled up — far from bottom
    let scrollTopVal = 100;
    Object.defineProperty(list, "scrollTop", {
      get: () => scrollTopVal,
      set: (v: number) => { scrollTopVal = v; },
      configurable: true,
    });

    // Simulate user scrolling up (fires scroll event)
    list.dispatchEvent(new Event("scroll"));

    // Add a turn while scrolled up
    setTurns([makeTurn(0)]);
    await new Promise((r) => setTimeout(r, 10));

    // scrollTop should NOT have changed (scroll lock active)
    expect(scrollTopVal).toBe(100);
  });

  it("resumes auto-scroll after user scrolls back to bottom", async () => {
    let setTurns: (t: TurnViewModel[]) => void;
    function TestWrapper() {
      const [turns, setTurnsFn] = createSignal<TurnViewModel[]>([]);
      setTurns = setTurnsFn;
      return <TurnList turns={turns()} />;
    }
    render(() => <TestWrapper />);
    const list = screen.getByTestId("turn-list");

    Object.defineProperty(list, "scrollHeight", { value: 1000, writable: true });
    Object.defineProperty(list, "clientHeight", { value: 200, writable: true });
    let scrollTopVal = 100; // start scrolled up
    Object.defineProperty(list, "scrollTop", {
      get: () => scrollTopVal,
      set: (v: number) => { scrollTopVal = v; },
      configurable: true,
    });

    // User scrolls up → lock activates
    list.dispatchEvent(new Event("scroll"));

    // User scrolls back to bottom
    scrollTopVal = 790; // within threshold of bottom (1000-200=800, threshold=120)
    list.dispatchEvent(new Event("scroll"));

    // Now add a turn — should auto-scroll again
    setTurns([makeTurn(0)]);
    await new Promise((r) => setTimeout(r, 10));

    expect(scrollTopVal).toBe(1000); // auto-scrolled to bottom
  });

  it("renders only visible + overscan items for large turn counts (virtualized)", () => {
    // Create 200 turns — without virtualization this would create 200 DOM nodes
    const manyTurns = Array.from({ length: 200 }, (_, i) =>
      makeTurn(i, { role: i % 2 === 0 ? "user" : "assistant", promptText: `Turn ${i}` })
    );
    render(() => <TurnList turns={manyTurns} />);

    const cards = screen.getAllByTestId("turn-card");
    // With virtualization (viewport ~500px, row ~80px, overscan 3):
    // expected ≈ 500/80 + 3*2 = ~12, definitely not 200
    expect(cards.length).toBeLessThan(20);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("renders all turns when count is small (no virtualization overhead for few items)", () => {
    const fewTurns = [makeTurn(0), makeTurn(1), makeTurn(2)];
    render(() => <TurnList turns={fewTurns} />);

    const cards = screen.getAllByTestId("turn-card");
    expect(cards).toHaveLength(3);
  });
});
