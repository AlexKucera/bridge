import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@solidjs/testing-library";
import { PiExecutionPanel } from "../components/execution/PiExecutionPanel";
import { createPiExecutionStore } from "../store/pi-store";
import { LiveState } from "../lib/execution-types";

// vi.mock is hoisted — factory must be self-contained, no external refs
const mockHandlers: Array<(e: { payload: string }) => void> = [];
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((channel: string, handler: (e: { payload: string }) => void) => {
    mockHandlers.push(handler);
    const unlisten = vi.fn(() => {
      const idx = mockHandlers.indexOf(handler);
      if (idx >= 0) mockHandlers.splice(idx, 1);
    });
    return Promise.resolve(unlisten);
  }),
}));

// Import the mocked module to get a typed reference to listen
import { listen as mockListen } from "@tauri-apps/api/event";
const typedListen = mockListen as ReturnType<typeof vi.fn>;

describe("PiExecutionPanel Tauri event integration", () => {
  let store: ReturnType<typeof createPiExecutionStore>;

  beforeEach(() => {
    store = createPiExecutionStore();
    typedListen.mockClear();
    mockHandlers.length = 0;
  });

  function getLastHandler(): (e: { payload: string }) => void | undefined {
    const call = typedListen.mock.calls.find(
      (c: [string, Function]) => c[0] === "execution-update"
    );
    return call?.[1];
  }

  it("subscribes to execution-update channel on mount", () => {
    render(() => <PiExecutionPanel store={store} sessionId="s1" />);
    expect(typedListen).toHaveBeenCalledWith("execution-update", expect.any(Function));
  });

  it("applies incoming status_changed events to the store model", () => {
    render(() => <PiExecutionPanel store={store} sessionId="s1" />);
    const handler = getLastHandler();
    expect(handler).toBeDefined();

    handler!({ payload: JSON.stringify({
      type: "status_changed",
      sessionId: "s1",
      status: "Thinking",
    }) });

    expect(store.model().status).toBe("Thinking");
  });

  it("applies incoming new_turn events to the store model", () => {
    render(() => <PiExecutionPanel store={store} sessionId="s1" />);
    const handler = getLastHandler();

    handler!({ payload: JSON.stringify({
      type: "new_turn",
      sessionId: "s1",
      turnId: 0,
    }) });

    expect(store.model().turns).toHaveLength(1);
    expect(store.model().turns[0].id).toBe(0);
  });

  it("applies incoming turn_updated events with thinking delta", () => {
    render(() => <PiExecutionPanel store={store} sessionId="s1" />);
    const handler = getLastHandler();

    store.applyEvent({ type: "new_turn", sessionId: "s1", turnId: 0 });

    handler!({ payload: JSON.stringify({
      type: "turn_updated",
      sessionId: "s1",
      turnId: 0,
      thinkingDelta: "Hello ",
    }) });

    expect(store.model().turns[0].thinkingText).toBe("Hello ");
  });

  it("applies incoming turn_updated events with text delta", () => {
    render(() => <PiExecutionPanel store={store} sessionId="s1" />);
    const handler = getLastHandler();

    store.applyEvent({ type: "new_turn", sessionId: "s1", turnId: 0 });

    handler!({ payload: JSON.stringify({
      type: "turn_updated",
      sessionId: "s1",
      turnId: 0,
      textDelta: "Hi there!",
    }) });

    expect(store.model().turns[0].responseText).toBe("Hi there!");
  });

  it("cleans up listener on unmount", async () => {
    const { unmount } = render(() => (
      <PiExecutionPanel store={store} sessionId="s1" />
    ));

    expect(typedListen).toHaveBeenCalledTimes(1);
    const unlistenPromise = typedListen.mock.results[0].value as Promise<ReturnType<typeof vi.fn>>;
    const unlistenFn = await unlistenPromise;

    unmount();

    // onCleanup may be async — flush microtasks
    await new Promise((r) => setTimeout(r, 0));

    expect(unlistenFn).toHaveBeenCalled();
  });

  it("initializes store model with sessionId on mount", () => {
    render(() => <PiExecutionPanel store={store} sessionId="session-abc" />);
    expect(store.model().sessionId).toBe("session-abc");
  });

  it("ignores events for a different session", () => {
    render(() => <PiExecutionPanel store={store} sessionId="session-abc" />);
    const handler = getLastHandler();

    // Event for different session should be ignored
    handler!({ payload: JSON.stringify({
      type: "status_changed",
      sessionId: "other-session",
      status: "Thinking",
    }) });

    // Status should remain unchanged (Queued)
    expect(store.model().status).toBe(LiveState.Queued);
  });

  it("processes events matching the session ID", () => {
    render(() => <PiExecutionPanel store={store} sessionId="session-abc" />);
    const handler = getLastHandler();

    handler!({ payload: JSON.stringify({
      type: "status_changed",
      sessionId: "session-abc",
      status: "RunningTool",
    }) });

    expect(store.model().status).toBe(LiveState.RunningTool);
  });
});
