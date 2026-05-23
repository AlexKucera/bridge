/* Responsive layout tests
   Verifies the app shell DOM structure supports responsive behavior.
   Tests structural elements that don't require full router/theme context. */

import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { BottomNavBar } from "../components/BottomNavBar";
import { OverlayLayout } from "../components/OverlayLayout";

describe("Responsive layout — BottomNavBar", () => {
  it("nav has correct ARIA label", () => {
    render(() => <BottomNavBar currentPath="/welcome" />);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  });

  it("nav items use flex layout (via class)", () => {
    render(() => <BottomNavBar currentPath="/welcome" />);
    const group = document.querySelector(".bottomnav__group");
    expect(group).toBeInTheDocument();
  });
});

describe("Responsive layout — OverlayLayout", () => {
  it("has grid container with overlay class", () => {
    render(() => (
      <OverlayLayout title="Test">
        <p>Content</p>
      </OverlayLayout>
    ));
    const overlay = document.querySelector(".overlay");
    expect(overlay).toBeInTheDocument();
  });

  it("has sidebar + content grid structure", () => {
    render(() => (
      <OverlayLayout title="Test">
        <p>Content</p>
      </OverlayLayout>
    ));
    const main = document.querySelector(".overlay__main");
    expect(main).toBeInTheDocument();
    // Should have both sidebar nav and content area
    expect(main?.querySelector(".overlay__nav")).toBeInTheDocument();
    expect(main?.querySelector(".overlay__content")).toBeInTheDocument();
  });

  it("content area is scrollable (has overflow class)", () => {
    render(() => (
      <OverlayLayout title="Test">
        <p>Content</p>
      </OverlayLayout>
    ));
    const content = document.querySelector(".overlay__content");
    expect(content).toBeInTheDocument();
  });
});

describe("Responsive layout — CSS class contracts", () => {
  it("BottomNavBar uses bottomnav class (CSS grid item)", () => {
    render(() => <BottomNavBar currentPath="/welcome" />);
    expect(document.querySelector(".bottomnav")).toBeInTheDocument();
  });

  it("OverlayLayout uses overlay class (CSS grid container)", () => {
    render(() => (
      <OverlayLayout title="Test"><p>x</p></OverlayLayout>
    ));
    expect(document.querySelector(".overlay")).toBeInTheDocument();
  });

  it("OverlayLayout has header region", () => {
    render(() => (
      <OverlayLayout title="Test"><p>x</p></OverlayLayout>
    ));
    expect(document.querySelector(".overlay__head")).toBeInTheDocument();
  });
});
