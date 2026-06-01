import { describe, it, expect } from "vitest";
import { createPiExecutionStore } from "../store/pi-store";
import { ExecutionViewModel, LiveState, DEFAULT_UI_PREFS } from "../lib/execution-types";

describe("createPiExecutionStore", () => {
  it("returns a store with model signal defaulting to empty ExecutionViewModel", () => {
    const store = createPiExecutionStore();
    const model = store.model();
    expect(model.sessionId).toBe("");
    expect(model.status).toBe(LiveState.Queued);
    expect(model.turns).toHaveLength(0);
  });

  it("returns a store with selectedTurnId signal defaulting to null", () => {
    const store = createPiExecutionStore();
    expect(store.selectedTurnId()).toBeNull();
  });

  it("returns a store with collapsedTurns set defaulting to empty", () => {
    const store = createPiExecutionStore();
    expect(store.collapsedTurns().size).toBe(0);
  });

  it("returns a store with hiddenToolCalls set defaulting to empty", () => {
    const store = createPiExecutionStore();
    expect(store.hiddenToolCalls().size).toBe(0);
  });

  it("returns a store with uiPrefs signal defaulting to DEFAULT_UI_PREFS", () => {
    const store = createPiExecutionStore();
    expect(store.uiPrefs()).toEqual(DEFAULT_UI_PREFS);
  });

  it("selectTurn updates selectedTurnId signal", () => {
    const store = createPiExecutionStore();
    expect(store.selectedTurnId()).toBeNull();
    store.selectTurn(3);
    expect(store.selectedTurnId()).toBe(3);
    store.selectTurn(null);
    expect(store.selectedTurnId()).toBeNull();
  });

  it("toggleTurnCollapse adds turn id to collapsedTurns set", () => {
    const store = createPiExecutionStore();
    store.toggleTurnCollapse(0);
    expect(store.collapsedTurns().has(0)).toBe(true);
  });

  it("toggleTurnCollapse removes id on second toggle", () => {
    const store = createPiExecutionStore();
    store.toggleTurnCollapse(0);
    store.toggleTurnCollapse(0);
    expect(store.collapsedTurns().has(0)).toBe(false);
  });

  it("toggleToolCallVisibility adds tool call key to hiddenToolCalls set", () => {
    const store = createPiExecutionStore();
    store.toggleToolCallVisibility(0, "tc-1");
    expect(store.hiddenToolCalls().has("0:tc-1")).toBe(true);
  });

  it("toggleToolCallVisibility removes key on second toggle", () => {
    const store = createPiExecutionStore();
    store.toggleToolCallVisibility(0, "tc-1");
    store.toggleToolCallVisibility(0, "tc-1");
    expect(store.hiddenToolCalls().has("0:tc-1")).toBe(false);
  });

  it("setUiPref updates a single uiPref field", () => {
    const store = createPiExecutionStore();
    expect(store.uiPrefs().compact).toBe(false);
    store.setUiPref("compact", true);
    expect(store.uiPrefs().compact).toBe(true);
    // Other prefs unchanged
    expect(store.uiPrefs().fontSize).toBe(14);
  });

  it("reset clears all state back to defaults", () => {
    const store = createPiExecutionStore();
    store.selectTurn(5);
    store.toggleTurnCollapse(2);
    store.toggleToolCallVisibility(0, "tc-1");
    store.setUiPref("compact", true);
    store.setModel({
      ...store.model(),
      sessionId: "sess-1",
      status: LiveState.Done,
      turns: [{ id: 0, role: "user", promptText: "hi", thinkingText: "", responseText: "", toolCalls: [], metrics: { tokensUsed: 0, costUsd: 0, toolCallCount: 0, durationMs: 0 }, isCollapsed: false }],
    });

    store.reset();

    expect(store.model().sessionId).toBe("");
    expect(store.model().status).toBe(LiveState.Queued);
    expect(store.model().turns).toHaveLength(0);
    expect(store.selectedTurnId()).toBeNull();
    expect(store.collapsedTurns().size).toBe(0);
    expect(store.hiddenToolCalls().size).toBe(0);
    expect(store.uiPrefs().compact).toBe(false);
  });

  it("isSessionActive returns true for active states", () => {
    const store = createPiExecutionStore();
    // Default is Queued → not active
    expect(store.isSessionActive()).toBe(false);

    const activeStates = [
      LiveState.Starting, LiveState.Idle, LiveState.Thinking,
      LiveState.RunningTool, LiveState.StreamingText,
    ];
    for (const state of activeStates) {
      store.setModel({ ...store.model(), status: state });
      expect(store.isSessionActive()).toBe(true);
    }
  });

  it("isSessionActive returns false for terminal states", () => {
    const store = createPiExecutionStore();
    const terminalStates = [
      LiveState.Queued, LiveState.Done, LiveState.Error, LiveState.Stopped,
    ];
    for (const state of terminalStates) {
      store.setModel({ ...store.model(), status: state });
      expect(store.isSessionActive()).toBe(false);
    }
  });

  describe("applyEvent", () => {
    it("applies a session-start event updating sessionId and status", () => {
      const store = createPiExecutionStore();
      store.applyEvent({
        type: "status_changed",
        sessionId: "sess-42",
        status: "Starting",
      });
      expect(store.model().sessionId).toBe("sess-42");
      expect(store.model().status).toBe(LiveState.Starting);
    });

    it("applies a new_turn event adding a turn to the model", () => {
      const store = createPiExecutionStore();
      store.applyEvent({ type: "new_turn", sessionId: "s1", turnId: 0 });
      expect(store.model().turns).toHaveLength(1);
      expect(store.model().turns[0].id).toBe(0);
    });

    it("applies a turn_updated event with prompt text", () => {
      const store = createPiExecutionStore();
      // First create a turn
      store.applyEvent({ type: "new_turn", sessionId: "s1", turnId: 0 });
      // Then update it with user message
      store.applyEvent({
        type: "turn_updated", sessionId: "s1", turnId: 0,
        role: "user", promptText: "Hello world",
      });
      expect(store.model().turns[0].promptText).toBe("Hello world");
      expect(store.model().turns[0].role).toBe("user");
    });

    it("applies thinking_delta accumulating thinking text", () => {
      const store = createPiExecutionStore();
      store.applyEvent({ type: "new_turn", sessionId: "s1", turnId: 0 });
      store.applyEvent({ type: "turn_updated", sessionId: "s1", turnId: 0, thinkingDelta: "hello " });
      store.applyEvent({ type: "turn_updated", sessionId: "s1", turnId: 0, thinkingDelta: "world" });
      expect(store.model().turns[0].thinkingText).toBe("hello world");
    });

    it("applies text_delta accumulating response text", () => {
      const store = createPiExecutionStore();
      store.applyEvent({ type: "new_turn", sessionId: "s1", turnId: 0 });
      store.applyEvent({ type: "turn_updated", sessionId: "s1", turnId: 0, textDelta: "Hi " });
      store.applyEvent({ type: "turn_updated", sessionId: "s1", turnId: 0, textDelta: "there!" });
      expect(store.model().turns[0].responseText).toBe("Hi there!");
    });

    it("applies status change to Done on agent_end", () => {
      const store = createPiExecutionStore();
      store.applyEvent({ type: "status_changed", sessionId: "s1", status: "Done" });
      expect(store.model().status).toBe(LiveState.Done);
      expect(store.isSessionActive()).toBe(false);
    });

    it("captures unknown event types in unknownEvents array without crashing", () => {
      const store = createPiExecutionStore();
      const unknownEvent = { type: "future_event_type", sessionId: "s1", someField: "data" };
      store.applyEvent(unknownEvent as any);
      expect(store.model().unknownEvents).toHaveLength(1);
      expect(store.model().unknownEvents[0]).toEqual(unknownEvent);
    });

    it("accumulates multiple unknown events in order", () => {
      const store = createPiExecutionStore();
      store.applyEvent({ type: "alpha_event" } as any);
      store.applyEvent({ type: "beta_event" } as any);
      store.applyEvent({ type: "status_changed", status: "Done" }); // known event
      store.applyEvent({ type: "gamma_event" } as any);
      expect(store.model().unknownEvents).toHaveLength(3);
      expect(store.model().unknownEvents[0].type).toBe("alpha_event");
      expect(store.model().unknownEvents[1].type).toBe("beta_event");
      expect(store.model().unknownEvents[2].type).toBe("gamma_event");
    });

    it("clears unknownEvents on reset", () => {
      const store = createPiExecutionStore();
      store.applyEvent({ type: "mystery" } as any);
      expect(store.model().unknownEvents).toHaveLength(1);
      store.reset();
      expect(store.model().unknownEvents).toHaveLength(0);
    });
  });
});
