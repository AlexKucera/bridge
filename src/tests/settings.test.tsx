/* SettingsScreen tests — TDD for Bridge settings UI */

import { render, screen } from "@solidjs/testing-library";
import { SettingsScreen } from "../screens/SettingsScreen";

describe("SettingsScreen", () => {
  it("renders inside OverlayLayout with correct title", () => {
    render(() => <SettingsScreen />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText(/configure bridge behavior/i)).toBeInTheDocument();
  });

  it("shows navigation sidebar with Global and Pi sections", () => {
    render(() => <SettingsScreen />);
    expect(screen.getByText("Global")).toBeInTheDocument();
    expect(screen.getByText("Pi")).toBeInTheDocument();
  });

  it("renders Appearance section with setting blocks", () => {
    render(() => <SettingsScreen />);
    // "Appearance" appears in both nav and section heading — use getAllByText
    const sections = screen.getAllByText("Appearance");
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Accent")).toBeInTheDocument();
    expect(screen.getByText("Density")).toBeInTheDocument();
  });

  it("renders Pi Configuration section with setting blocks", () => {
    render(() => <SettingsScreen />);
    expect(screen.getByText("Pi Configuration")).toBeInTheDocument();
    expect(screen.getByText("Pi Binary")).toBeInTheDocument();
    expect(screen.getByText("Default Model")).toBeInTheDocument();
    expect(screen.getByText("Tool Policy")).toBeInTheDocument();
  });

  it("renders Validation section", () => {
    render(() => <SettingsScreen />);
    expect(screen.getByText("Validation")).toBeInTheDocument();
  });

  it("shows keyboard shortcut hints on appearance labels", () => {
    render(() => <SettingsScreen />);
    // kbd elements don't have implicit ARIA roles; query by class
    const kbds = document.querySelectorAll("kbd.setting__kbd");
    const kbdTexts = Array.from(kbds).map((k) => k.textContent);
    expect(kbdTexts).toContain("T");
    expect(kbdTexts).toContain("A");
    expect(kbdTexts).toContain("D");
    expect(kbdTexts).toContain("P");
  });

  it("uses overlay layout structure with sidebar nav", () => {
    const { container } = render(() => <SettingsScreen />);
    // Should have overlay container
    expect(container.querySelector(".overlay")).toBeInTheDocument();
    // Should have sidebar navigation
    expect(container.querySelector(".overlay__nav")).toBeInTheDocument();
    // Should have content area
    expect(container.querySelector(".overlay__content")).toBeInTheDocument();
  });
});
