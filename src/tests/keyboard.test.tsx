/* Keyboard shortcut tests
   Tests that digits 1-5 activate the corresponding nav section.
   Tests through BottomNavBar (pure component, no router dependency). */

import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import { BottomNavBar } from "../components/BottomNavBar";

describe("Keyboard shortcuts", () => {
  let onNavigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onNavigate = vi.fn();
  });

  function renderNav(path: string = "/welcome") {
    return render(() => (
      <BottomNavBar currentPath={path} onNavigate={onNavigate} />
    ));
  }

  it("pressing '1' calls onNavigate with /fleet", () => {
    renderNav();
    fireEvent.keyDown(window, { key: "1" });
    expect(onNavigate).toHaveBeenCalledWith("/fleet");
  });

  it("pressing '2' calls onNavigate with /charts", () => {
    renderNav();
    fireEvent.keyDown(window, { key: "2" });
    expect(onNavigate).toHaveBeenCalledWith("/charts");
  });

  it("pressing '3' calls onNavigate with /log", () => {
    renderNav();
    fireEvent.keyDown(window, { key: "3" });
    expect(onNavigate).toHaveBeenCalledWith("/log");
  });

  it("pressing '4' calls onNavigate with /helm", () => {
    renderNav();
    fireEvent.keyDown(window, { key: "4" });
    expect(onNavigate).toHaveBeenCalledWith("/helm");
  });

  it("pressing '5' calls onNavigate with /welcome", () => {
    renderNav("/fleet");
    fireEvent.keyDown(window, { key: "5" });
    expect(onNavigate).toHaveBeenCalledWith("/welcome");
  });

  it("does not fire when typing in an input field", () => {
    renderNav();
    const input = document.createElement("input");
    document.body.appendChild(input);
    fireEvent.keyDown(input as unknown as Window & EventTarget, { key: "1" });
    expect(onNavigate).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("does not fire when typing in a textarea", () => {
    renderNav();
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    fireEvent.keyDown(textarea as unknown as Window & EventTarget, { key: "2" });
    expect(onNavigate).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it("ignores non-digit keys", () => {
    renderNav();
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "6" });
    fireEvent.keyDown(window, { key: "0" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("does not attach listener when keyboardShortcuts is false", () => {
    render(() => (
      <BottomNavBar currentPath="/welcome" onNavigate={onNavigate} keyboardShortcuts={false} />
    ));
    fireEvent.keyDown(window, { key: "1" });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
