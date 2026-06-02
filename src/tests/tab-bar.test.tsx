/// Tests for TabBar component.
///
/// Covers: renders both tabs, active tab styling, click switching,
/// badge count display, hidden when zero, keyboard accessibility.

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { TabBar } from "../components/terminal/TabBar";
import type { TabStore } from "../store/tab-store";
import { createTabStore } from "../store/tab-store";
import { TabId } from "../lib/tab-types";

describe("TabBar", () => {
  let store: TabStore;

  beforeEach(() => {
    store = createTabStore();
  });

  it("renders both tab buttons", () => {
    const { unmount } = render(() => <TabBar store={store} />);
    expect(screen.getByRole("tab", { name: /structured/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /terminal/i })).toBeInTheDocument();
    unmount();
  });

  it("marks Structured tab as selected by default", () => {
    const { unmount } = render(() => <TabBar store={store} />);
    const structuredTab = screen.getByRole("tab", { name: /structured/i });
    expect(structuredTab).toHaveAttribute("aria-selected", "true");
    unmount();
  });

  it("marks Terminal tab as not selected by default", () => {
    const { unmount } = render(() => <TabBar store={store} />);
    const terminalTab = screen.getByRole("tab", { name: /terminal/i });
    expect(terminalTab).toHaveAttribute("aria-selected", "false");
    unmount();
  });

  it("switches to Terminal when clicked", async () => {
    const { unmount } = render(() => <TabBar store={store} />);
    const terminalTab = screen.getByRole("tab", { name: /terminal/i });
    fireEvent.click(terminalTab);

    expect(store.activeTab()).toBe(TabId.Terminal);
    expect(terminalTab).toHaveAttribute("aria-selected", "true");
    unmount();
  });

  it("switches back to Structured when clicked", async () => {
    const { unmount } = render(() => <TabBar store={store} />);
    // First switch to Terminal
    fireEvent.click(screen.getByRole("tab", { name: /terminal/i }));
    // Then switch back
    fireEvent.click(screen.getByRole("tab", { name: /structured/i }));

    expect(store.activeTab()).toBe(TabId.Structured);
    expect(screen.getByRole("tab", { name: /structured/i }))
      .toHaveAttribute("aria-selected", "true");
    unmount();
  });

  it("does not show badge when count is zero", () => {
    const { unmount } = render(() => <TabBar store={store} />);
    // No badge elements should be visible
    const badges = screen.queryAllByTestId(/tab-badge/);
    expect(badges.length).toBe(0);
    unmount();
  });

  it("shows badge count on Structured tab when incremented", () => {
    store.incrementBadge(TabId.Structured);
    const { unmount } = render(() => <TabBar store={store} />);

    const badge = screen.getByTestId("tab-badge-structured");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe("1");
    unmount();
  });

  it("shows badge count on Terminal tab when incremented", () => {
    store.incrementBadge(TabId.Terminal);
    store.incrementBadge(TabId.Terminal);
    const { unmount } = render(() => <TabBar store={store} />);

    const badge = screen.getByTestId("tab-badge-terminal");
    expect(badge.textContent).toBe("2");
    unmount();
  });

  it("clears badge after switching to that tab", async () => {
    store.incrementBadge(TabId.Terminal);
    store.incrementBadge(TabId.Terminal);
    const { unmount } = render(() => <TabBar store={store} />);

    // Badge should show before click
    expect(screen.getByTestId("tab-badge-terminal").textContent).toBe("2");

    // Click to switch
    fireEvent.click(screen.getByRole("tab", { name: /terminal/i }));

    // Badge should be gone
    expect(screen.queryByTestId("tab-badge-terminal")).not.toBeInTheDocument();
    unmount();
  });

  it("renders with role=tablist for accessibility", () => {
    const { unmount } = render(() => <TabBar store={store} />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    unmount();
  });
});
