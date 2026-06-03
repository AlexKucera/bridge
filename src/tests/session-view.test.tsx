/// Tests for SessionViewContainer — tab-aware panel wrapper.
///
/// Covers: renders TabBar, shows/hides panels based on active tab,
/// preserves state across tab switches, ARIA attributes, and now
/// the Cargo panel integration.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createTabStore } from "../store/tab-store";
import { TabId } from "../lib/tab-types";
import { SessionViewContainer } from "../components/terminal/SessionViewContainer";

// Minimal mock stores that satisfy the type contracts
function createMockPtyStore() {
  return {
    sessionId: () => "test-session",
    fit: vi.fn(),
    write: vi.fn(),
    clear: vi.fn(),
    reset: vi.fn(),
    isSessionActive: () => true,
    isConnected: () => false,
    outputLines: () => [],
    sessionTitle: () => () => "",
  };
}

function createMockExecStore() {
  return {
    sessionId: () => "test-exec",
    events: () => [],
    isLoading: () => false,
    error: () => null,
    currentTurn: () => null,
    turns: () => [],
    metrics: () => null,
    fetchEvents: vi.fn(),
    clearError: vi.fn(),
  };
}

function renderWithTabs(vesselPath?: string) {
  const tabStore = createTabStore();
  const ptyStore = createMockPtyStore();
  const execStore = createMockExecStore();

  const result = render(() => (
    <SessionViewContainer
      tabStore={tabStore}
      ptyStore={ptyStore as any}
      execStore={execStore as any}
      sessionId="test-123"
      vesselPath={vesselPath}
    />
  ));

  return { tabStore, ptyStore, execStore, ...result };
}

describe("SessionViewContainer", () => {
  it("renders a TabBar", () => {
    renderWithTabs();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("renders Structured panel by default (hidden=false)", () => {
    const { container } = renderWithTabs();
    const structuredPanel = container.querySelector("#structured-panel");
    expect(structuredPanel).toBeInTheDocument();
    // Should NOT have hidden class when on default (Structured) tab
    expect(structuredPanel?.classList.contains(
      "session-view__panel--hidden",
    )).toBe(false);
  });

  it("hides Structured panel when Terminal is active", () => {
    const { tabStore, container } = renderWithTabs();
    tabStore.setActiveTab(TabId.Terminal);

    const structuredPanel = container.querySelector("#structured-panel");
    expect(structuredPanel?.classList.contains(
      "session-view__panel--hidden",
    )).toBe(true);
  });

  it("hides Structured panel when Cargo is active", () => {
    const { tabStore, container } = renderWithTabs();
    tabStore.setActiveTab(TabId.Cargo);

    const structuredPanel = container.querySelector("#structured-panel");
    expect(structuredPanel?.classList.contains(
      "session-view__panel--hidden",
    )).toBe(true);
  });

  it("shows Terminal panel when Terminal is active", () => {
    const { tabStore, container } = renderWithTabs();
    tabStore.setActiveTab(TabId.Terminal);

    const terminalPanel = container.querySelector("#terminal-panel");
    expect(terminalPanel).toBeInTheDocument();
    expect(terminalPanel?.classList.contains(
      "session-view__panel--hidden",
    )).toBe(false);
  });

  it("hides Terminal panel when Structured is active", () => {
    const { container } = renderWithTabs();
    const terminalPanel = container.querySelector("#terminal-panel");
    expect(terminalPanel?.classList.contains(
      "session-view__panel--hidden",
    )).toBe(true);
  });

  it("hides Terminal panel when Cargo is active", () => {
    const { tabStore, container } = renderWithTabs();
    tabStore.setActiveTab(TabId.Cargo);

    const terminalPanel = container.querySelector("#terminal-panel");
    expect(terminalPanel?.classList.contains(
      "session-view__panel--hidden",
    )).toBe(true);
  });

  it("shows Cargo panel when Cargo is active and vesselPath provided", () => {
    const { tabStore, container } = renderWithTabs("/tmp/test-repo");
    tabStore.setActiveTab(TabId.Cargo);

    const cargoPanel = container.querySelector("#cargo-panel");
    expect(cargoPanel).toBeInTheDocument();
    expect(cargoPanel?.classList.contains(
      "session-view__panel--hidden",
    )).toBe(false);
  });

  it("hides Cargo panel when not active", () => {
    const { container } = renderWithTabs("/tmp/test-repo");

    const cargoPanel = container.querySelector("#cargo-panel");
    expect(cargoPanel).toBeInTheDocument(); // DOM exists
    expect(cargoPanel?.classList.contains(
      "session-view__panel--hidden",
    )).toBe(true); // but hidden
  });

  it("does not render Cargo panel DOM without vesselPath", () => {
    const { tabStore, container } = renderWithTabs(undefined);
    tabStore.setActiveTab(TabId.Cargo);

    const cargoPanel = container.querySelector("#cargo-panel");
    expect(cargoPanel).not.toBeInTheDocument();
  });

  it("uses ARIA role=tabpanel for each view", () => {
    const { container } = renderWithTabs("/tmp/repo");

    const panels = container.querySelectorAll("[role='tabpanel']");
    // Always has structured + terminal; cargo only with vesselPath
    expect(panels.length).toBeGreaterThanOrEqual(2);
  });

  it("sets aria-hidden correctly for hidden panels", () => {
    const { tabStore, container } = renderWithTabs("/tmp/repo");

    // Default: Structured visible, others hidden
    const structured = container.querySelector(
      "#structured-panel",
    ) as HTMLElement;
    const terminal = container.querySelector(
      "#terminal-panel",
    ) as HTMLElement;
    const cargo = container.querySelector("#cargo-panel") as HTMLElement;

    expect(structured.getAttribute("aria-hidden")).toBe("false");
    expect(terminal.getAttribute("aria-hidden")).toBe("true");
    expect(cargo.getAttribute("aria-hidden")).toBe("true");

    // Switch to Cargo
    tabStore.setActiveTab(TabId.Cargo);
    expect(structured.getAttribute("aria-hidden")).toBe("true");
    expect(terminal.getAttribute("aria-hidden")).toBe("true");
    expect(cargo.getAttribute("aria-hidden")).toBe("false");
  });

  it("preserves store state when switching tabs back and forth", () => {
    const { tabStore } = renderWithTabs("/tmp/repo");

    // Switch through all three tabs
    tabStore.setActiveTab(TabId.Terminal);
    expect(tabStore.activeTab()).toBe(TabId.Terminal);

    tabStore.setActiveTab(TabId.Cargo);
    expect(tabStore.activeTab()).toBe(TabId.Cargo);

    tabStore.setActiveTab(TabId.Structured);
    expect(tabStore.activeTab()).toBe(TabId.Structured);

    // Store still works fine
    tabStore.incrementBadge(TabId.Terminal);
    expect(tabStore.badgeCounts().terminal).toBe(1);
  });
});
