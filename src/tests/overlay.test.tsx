/* OverlayLayout tests
   Tests the sidebar + content shell layout component. */

import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { OverlayLayout } from "../components/OverlayLayout";

describe("OverlayLayout", () => {
  it("renders with overlay class", () => {
    render(() => (
      <OverlayLayout title="Test">
        <p>Content here</p>
      </OverlayLayout>
    ));
    expect(document.querySelector(".overlay")).toBeInTheDocument();
  });

  it("renders the title in header", () => {
    render(() => (
      <OverlayLayout title="Helm Panel">
        <p>Content</p>
      </OverlayLayout>
    ));
    expect(screen.getByText("Helm Panel")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    render(() => (
      <OverlayLayout title="Helm" subtitle="Vessel command interface">
        <p>Content</p>
      </OverlayLayout>
    ));
    expect(screen.getByText("Vessel command interface")).toBeInTheDocument();
  });

  it("does not render subtitle when not provided", () => {
    render(() => (
      <OverlayLayout title="Helm">
        <p>Content</p>
      </OverlayLayout>
    ));
    // Should not have a <p> element in the header (subtitle area)
    const header = document.querySelector(".overlay__head");
    const paragraphs = header?.querySelectorAll("p");
    expect(paragraphs?.length ?? 0).toBe(0);
  });

  it("renders children in content area", () => {
    render(() => (
      <OverlayLayout title="Test">
        <div data-testid="content">Main content</div>
      </OverlayLayout>
    ));
    const content = document.querySelector(".overlay__content");
    expect(content).toBeInTheDocument();
    expect(content?.querySelector("[data-testid='content']")).toBeInTheDocument();
    expect(content?.textContent).toContain("Main content");
  });

  it("renders sidebar navigation sections", () => {
    const navSections = [
      {
        title: "Navigation",
        items: [
          { href: "/helm", label: "Dashboard" },
          { href: "/helm/appearance", label: "Appearance" },
          { href: "/helm/commands", label: "Commands" },
        ],
      },
    ] as const;

    render(() => (
      <OverlayLayout title="Helm" navSections={navSections} currentPath="/helm">
        <p>Content</p>
      </OverlayLayout>
    ));

    const nav = screen.getByRole("navigation", { name: "Section navigation" });
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveTextContent("Navigation");
    expect(nav).toHaveTextContent("Dashboard");
    expect(nav).toHaveTextContent("Appearance");
    expect(nav).toHaveTextContent("Commands");
  });

  it("highlights active nav item with aria-current", () => {
    const navSections = [
      {
        title: "Nav",
        items: [
          { href: "/helm", label: "Dashboard" },
          { href: "/helm/appearance", label: "Appearance" },
        ],
      },
    ] as const;

    render(() => (
      <OverlayLayout title="Helm" navSections={navSections} currentPath="/helm/appearance">
        <p>Content</p>
      </OverlayLayout>
    ));

    const activeLink = screen.getByRole("link", { name: /Appearance/i });
    expect(activeLink).toHaveAttribute("aria-current", "true");

    const inactiveLink = screen.getByRole("link", { name: /Dashboard/i });
    expect(inactiveLink).not.toHaveAttribute("aria-current");
  });

  it("renders nav item icons when provided", () => {
    const navSections = [
      {
        title: "Nav",
        items: [
          { href: "/helm", label: "Dashboard", icon: "🧭" },
        ],
      },
    ] as const;

    render(() => (
      <OverlayLayout title="Helm" navSections={navSections}>
        <p>Content</p>
      </OverlayLayout>
    ));

    const link = screen.getByRole("link", { name: /Dashboard/i });
    expect(link.querySelector(".ico")).toBeInTheDocument();
    expect(link.querySelector(".ico")?.textContent).toContain("🧭");
  });

  it("has correct CSS grid structure classes", () => {
    render(() => (
      <OverlayLayout title="Test">
        <p>Content</p>
      </OverlayLayout>
    ));

    expect(document.querySelector(".overlay")).toBeInTheDocument();
    expect(document.querySelector(".overlay__main")).toBeInTheDocument();
    expect(document.querySelector(".overlay__head")).toBeInTheDocument();
    expect(document.querySelector(".overlay__content")).toBeInTheDocument();
  });
});
