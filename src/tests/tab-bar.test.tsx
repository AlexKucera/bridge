import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { TabBar } from "../components/terminal/TabBar";
import { createTabStore } from "../store/tab-store";
import { TabId } from "../lib/tab-types";

/**
 * Helper: create a fresh store + render TabBar, returning both.
 */
function renderWithStore() {
  const store = createTabStore();
  const result = render(() => <TabBar store={store} />);
  return { store, ...result };
}

describe("TabBar component", () => {
  describe("rendering", () => {
    it("renders three tab buttons", () => {
      const { unmount } = renderWithStore();

      expect(screen.getByTestId("tab-structured")).toBeInTheDocument();
      expect(screen.getByTestId("tab-terminal")).toBeInTheDocument();
      expect(screen.getByTestId("tab-cargo")).toBeInTheDocument();
      unmount();
    });

    it("renders correct labels", () => {
      const { unmount } = renderWithStore();

      expect(screen.getByText("Structured")).toBeInTheDocument();
      expect(screen.getByText("Terminal")).toBeInTheDocument();
      expect(screen.getByText("Cargo")).toBeInTheDocument();
      unmount();
    });

    it("marks Structured as active by default", () => {
      const { unmount } = renderWithStore();

      const structuredTab = screen.getByTestId("tab-structured");
      expect(structuredTab).toHaveClass("tab-bar__tab--active");
      expect(screen.getByTestId("tab-terminal")).not.toHaveClass("tab-bar__tab--active");
      expect(screen.getByTestId("tab-cargo")).not.toHaveClass("tab-bar__tab--active");
      unmount();
    });

    it("has ARIA role=tablist on container", () => {
      const { unmount } = renderWithStore();
      expect(screen.getByRole("tablist")).toBeInTheDocument();
      unmount();
    });

    it("gives each tab role=tab and aria-selected", () => {
      const { unmount } = renderWithStore();

      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBe(3);
      expect(tabs[0]).toHaveAttribute("aria-selected", "true");
      expect(tabs[1]).toHaveAttribute("aria-selected", "false");
      expect(tabs[2]).toHaveAttribute("aria-selected", "false");
      unmount();
    });
  });

  describe("click switching", () => {
    it("switches to Terminal when clicked", async () => {
      const { store, unmount } = renderWithStore();

      fireEvent.click(screen.getByTestId("tab-terminal"));
      expect(store.activeTab()).toBe(TabId.Terminal);
      expect(screen.getByTestId("tab-terminal")).toHaveClass("tab-bar__tab--active");
      expect(screen.getByTestId("tab-structured")).not.toHaveClass("tab-bar__tab--active");
      unmount();
    });

    it("switches to Cargo when clicked", async () => {
      const { store, unmount } = renderWithStore();

      fireEvent.click(screen.getByTestId("tab-cargo"));
      expect(store.activeTab()).toBe(TabId.Cargo);
      expect(screen.getByTestId("tab-cargo")).toHaveClass("tab-bar__tab--active");
      expect(screen.getByTestId("tab-structured")).not.toHaveClass("tab-bar__tab--active");
      unmount();
    });

    it("switches back to Structured when clicked", async () => {
      const { store, unmount } = renderWithStore();

      // Go to Cargo first
      fireEvent.click(screen.getByTestId("tab-cargo"));
      expect(store.activeTab()).toBe(TabId.Cargo);

      // Click Structured
      fireEvent.click(screen.getByTestId("tab-structured"));
      expect(store.activeTab()).toBe(TabId.Structured);
      expect(screen.getByTestId("tab-structured")).toHaveClass("tab-bar__tab--active");
      unmount();
    });
  });

  describe("badges", () => {
    it("does not show badges when count is zero", () => {
      const { unmount } = renderWithStore();
      const badges = screen.queryAllByTestId(/tab-badge-/);
      expect(badges.length).toBe(0);
      unmount();
    });

    it("shows terminal badge when incremented", () => {
      const { store, unmount } = renderWithStore();
      store.incrementBadge(TabId.Terminal);
      const badge = screen.getByTestId("tab-badge-terminal");
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe("1");
      unmount();
    });

    it("shows cargo badge when incremented", () => {
      const { store, unmount } = renderWithStore();
      store.incrementBadge(TabId.Cargo);
      const badge = screen.getByTestId("tab-badge-cargo");
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe("1");
      unmount();
    });

    it("shows cargo badge count when incremented multiple times", () => {
      const { store, unmount } = renderWithStore();
      store.incrementBadge(TabId.Cargo);
      store.incrementBadge(TabId.Cargo);
      store.incrementBadge(TabId.Cargo);
      const badge = screen.getByTestId("tab-badge-cargo");
      expect(badge).toBeInTheDocument();
      expect(badge.textContent).toBe("3");
      unmount();
    });

    it("clears badge after switching to that tab (Cargo)", async () => {
      const freshStore = createTabStore();
      const { unmount } = render(() => <TabBar store={freshStore} />);

      freshStore.incrementBadge(TabId.Cargo);
      freshStore.incrementBadge(TabId.Cargo);
      expect(screen.getByTestId("tab-badge-cargo").textContent).toBe("2");

      fireEvent.click(screen.getByTestId("tab-cargo"));
      expect(screen.queryByTestId("tab-badge-cargo")).not.toBeInTheDocument();
      unmount();
    });
  });

  describe("data attributes", () => {
    it("sets data-active-tab on indicator div", () => {
      const { unmount } = renderWithStore();
      const indicator = screen.getByTestId("tab-bar").querySelector(".tab-bar__indicator");
      expect(indicator?.getAttribute("data-active-tab")).toBe("Structured");
      unmount();
    });

    it("updates data-active-tab when tab switches", () => {
      const { unmount } = renderWithStore();
      const indicator = screen.getByTestId("tab-bar").querySelector(".tab-bar__indicator");

      fireEvent.click(screen.getByTestId("tab-terminal"));
      expect(indicator?.getAttribute("data-active-tab")).toBe("Terminal");

      fireEvent.click(screen.getByTestId("tab-cargo"));
      expect(indicator?.getAttribute("data-active-tab")).toBe("Cargo");
      unmount();
    });
  });
});
