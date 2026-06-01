import { describe, it, expect, vi } from "vitest";

// Mock Tauri event system (PiExecutionPanel now imports listen)
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

import { render, screen } from "@solidjs/testing-library";
import { PiExecutionPanel } from "../components/execution/PiExecutionPanel";
import { createPiExecutionStore } from "../store/pi-store";
import { LiveState, ToolCallStatus } from "../lib/execution-types";

describe("PiExecutionPanel", () => {
  it("renders SessionHeader with model data from store", () => {
    const store = createPiExecutionStore();
    store.setModel({
      ...store.model(),
      modelName: "claude-sonnet-4",
      provider: "anthropic",
      thinkingLevel: "medium",
      status: LiveState.Idle,
    });
    render(() => <PiExecutionPanel store={store} sessionId="s1" />);
    screen.getByText("claude-sonnet-4");
    screen.getByText("anthropic");
  });

  it("renders TurnList with turns from store", () => {
    const store = createPiExecutionStore();
    store.applyEvent({ type: "new_turn", sessionId: "s1", turnId: 0 });
    store.applyEvent({
      type: "turn_updated", sessionId: "s1", turnId: 0,
      role: "user", promptText: "Hello world",
    });
    render(() => <PiExecutionPanel store={store} sessionId="s1" />);
    screen.getByText("Hello world");
  });

  it("renders empty state when no turns exist", () => {
    const store = createPiExecutionStore();
    render(() => <PiExecutionPanel store={store} sessionId="s1" />);
    screen.getByText(/no activity/i);
  });

  it("passes status and elapsed time to SessionHeader", () => {
    const store = createPiExecutionStore();
    store.setModel({
      ...store.model(),
      status: LiveState.Thinking,
      elapsedMs: 30000,
    });
    render(() => <PiExecutionPanel store={store} sessionId="s1" />);
    screen.getByText("Thinking");
    screen.getByText((c) => c.includes("00:30"));
  });

  it("wires store toggle actions to child components", async () => {
    const store = createPiExecutionStore();
    store.applyEvent({ type: "new_turn", sessionId: "s1", turnId: 0 });
    store.applyEvent({
      type: "turn_updated", sessionId: "s1", turnId: 0,
      role: "user", promptText: "Test prompt",
    });
    render(() => <PiExecutionPanel store={store} sessionId="s1" />);

    // Click a turn header to collapse
    const headers = screen.getAllByRole("button");
    // First button is the turn card header
    expect(store.collapsedTurns().size).toBe(0);
    await headers[0].click();
    expect(store.collapsedTurns().has(0)).toBe(true);
  });
});
