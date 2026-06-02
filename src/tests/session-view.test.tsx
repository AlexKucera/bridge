/// Tests for SessionViewContainer — the tab-aware wrapper around
/// Structured (PiExecutionPanel) and Terminal (CommsDeckPanel) views.
///
/// Covers: renders TabBar + both panels, shows/hides correct panel
/// per active tab, state preservation on switch, default tab by mode.

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { SessionViewContainer } from "../components/terminal/SessionViewContainer";
import type { TabStore } from "../store/tab-store";
import { createTabStore } from "../store/tab-store";
import type { PtyStore } from "../store/pty-store";
import { createPtyStore } from "../store/pty-store";
import type { PiExecutionStore } from "../store/pi-store";
import { createPiExecutionStore } from "../store/pi-store";
import { TabId } from "../lib/tab-types";

describe("SessionViewContainer", () => {
  let tabStore: TabStore;
  let ptyStore: PtyStore;
  let execStore: PiExecutionStore;

  beforeEach(() => {
    tabStore = createTabStore();
    ptyStore = createPtyStore();
    execStore = createPiExecutionStore();
  });

  it("renders the TabBar", () => {
    const { unmount } = render(() => (
      <SessionViewContainer
        tabStore={tabStore}
        ptyStore={ptyStore}
        execStore={execStore}
        sessionId="test-1"
      />
    ));
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    unmount();
  });

  it("renders structured panel by default (json mode)", () => {
    const { unmount } = render(() => (
      <SessionViewContainer
        tabStore={tabStore}
        ptyStore={ptyStore}
        execStore={execStore}
        sessionId="test-1"
      />
    ));
    expect(screen.getByTestId("execution-panel")).toBeInTheDocument();
    unmount();
  });

  it("hides terminal panel wrapper by default", () => {
    const { unmount } = render(() => (
      <SessionViewContainer
        tabStore={tabStore}
        ptyStore={ptyStore}
        execStore={execStore}
        sessionId="test-1"
      />
    ));

    // Terminal wrapper div should have hidden class
    const terminalPanel = document.getElementById("terminal-panel");
    expect(terminalPanel).not.toBeNull();
    expect(terminalPanel!.classList.contains("session-view__panel--hidden")).toBe(true);
    unmount();
  });

  it("shows terminal panel when switched to Terminal tab", async () => {
    const { unmount } = render(() => (
      <SessionViewContainer
        tabStore={tabStore}
        ptyStore={ptyStore}
        execStore={execStore}
        sessionId="test-1"
      />
    ));

    fireEvent.click(screen.getByRole("tab", { name: /terminal/i }));

    const terminalPanel = document.getElementById("terminal-panel");
    expect(terminalPanel).not.toBeNull();
    expect(terminalPanel!.classList.contains("session-view__panel--hidden")).toBe(false);
    unmount();
  });

  it("hides structured panel when on Terminal tab", async () => {
    const { unmount } = render(() => (
      <SessionViewContainer
        tabStore={tabStore}
        ptyStore={ptyStore}
        execStore={execStore}
        sessionId="test-1"
      />
    ));

    fireEvent.click(screen.getByRole("tab", { name: /terminal/i }));

    // Structured wrapper should have hidden class
    const structuredPanel = document.getElementById("structured-panel");
    expect(structuredPanel).not.toBeNull();
    expect(structuredPanel!.classList.contains("session-view__panel--hidden")).toBe(true);
    unmount();
  });

  it("defaults to Terminal tab for PTY-mode sessions", () => {
    const ptyTabStore = createTabStore({ defaultMode: "pty" });
    const { unmount } = render(() => (
      <SessionViewContainer
        tabStore={ptyTabStore}
        ptyStore={ptyStore}
        execStore={execStore}
        sessionId="pty-session-1"
      />
    ));

    expect(ptyTabStore.activeTab()).toBe(TabId.Terminal);

    // Terminal panel should be visible (no hidden class)
    const terminalPanel = document.getElementById("terminal-panel");
    expect(terminalPanel).not.toBeNull();
    expect(terminalPanel!.classList.contains("session-view__panel--hidden")).toBe(false);
    unmount();
  });

  it("preserves structured state when switching away and back", async () => {
    const { unmount } = render(() => (
      <SessionViewContainer
        tabStore={tabStore}
        ptyStore={ptyStore}
        execStore={execStore}
        sessionId="test-1"
      />
    ));

    // Apply some state to execution store
    execStore.applyEvent({
      type: "status_changed",
      sessionId: "test-1",
      status: "Thinking",
    });

    // Switch to terminal
    fireEvent.click(screen.getByRole("tab", { name: /terminal/i }));

    // Switch back to structured
    fireEvent.click(screen.getByRole("tab", { name: /structured/i }));

    // Execution store should still have its state (always-mounted pattern)
    expect(execStore.model().status).toBe("Thinking");
    unmount();
  });

  it("preserves terminal state when switching away and back", async () => {
    const { unmount } = render(() => (
      <SessionViewContainer
        tabStore={tabStore}
        ptyStore={ptyStore}
        execStore={execStore}
        sessionId="test-1"
      />
    ));

    // Simulate terminal output
    ptyStore.connect("test-1");
    ptyStore.applyOutput({
      sessionId: "test-1",
      data: "hello from terminal\r\n",
      timestamp: new Date().toISOString(),
    });

    // Switch to structured then back to terminal
    fireEvent.click(screen.getByRole("tab", { name: /structured/i }));
    fireEvent.click(screen.getByRole("tab", { name: /terminal/i }));

    // PTY store should preserve its buffer (always-mounted pattern)
    expect(ptyStore.outputBuffer()).toContain("hello from terminal");
    unmount();
  });

  it("renders both panels in DOM for state preservation", () => {
    const { unmount } = render(() => (
      <SessionViewContainer
        tabStore={tabStore}
        ptyStore={ptyStore}
        execStore={execStore}
        sessionId="session-99"
      />
    ));

    // Both panels exist in DOM (always-mounted — hidden via CSS, not unmounted)
    expect(screen.getByTestId("execution-panel")).toBeInTheDocument();
    expect(screen.getByTestId("comms-deck-panel")).toBeInTheDocument();
    unmount();
  });
});
