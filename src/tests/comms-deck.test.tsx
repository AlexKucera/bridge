/// Tests for terminal components: ScanLineOverlay, CommsDeckPanel.
///
/// Covers: rendering, props, status bar states, CSS classes,
/// store integration, event wiring (mocked).

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { ScanLineOverlay } from "../components/terminal/ScanLineOverlay";
import type { PtyStore } from "../store/pty-store";
import { createPtyStore } from "../store/pty-store";

// ─── ScanLineOverlay ──────────────────────────────────────────

describe("ScanLineOverlay", () => {
  it("renders with visible=true", () => {
    const { unmount } = render(() => <ScanLineOverlay visible={true} />);
    const overlay = screen.getByTestId("scanline-overlay");
    expect(overlay).toBeInTheDocument();
    expect(overlay.classList.contains("scanline-overlay--visible")).toBe(true);
    expect(overlay.classList.contains("scanline-overlay--hidden")).toBe(false);
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    unmount();
  });

  it("applies hidden class when visible=false", () => {
    const { unmount } = render(() => <ScanLineOverlay visible={false} />);
    const overlay = screen.getByTestId("scanline-overlay");
    expect(overlay.classList.contains("scanline-overlay--hidden")).toBe(true);
    expect(overlay.classList.contains("scanline-overlay--visible")).toBe(false);
    unmount();
  });
});

// ─── CommsDeckPanel Integration (store wiring) ────────────────

describe("CommsDeckPanel — Store Wiring", () => {
  let store: PtyStore;

  beforeEach(() => {
    store = createPtyStore();
  });

  it("connects to store on mount", () => {
    // Simulate what CommsDeckPanel does in onMount
    store.connect("pty-session-42");
    expect(store.status()).toBe("Connected");
    expect(store.isActive()).toBe(true);
    expect(store.isConnected()).toBe(true);
  });

  it("disconnects from store on cleanup", () => {
    store.connect("pty-session-42");
    // Simulate cleanup
    store.disconnect();
    expect(store.status()).toBe("Disconnected");
    expect(store.isActive()).toBe(false);
  });

  it("accumulates PTY output via applyOutput", () => {
    store.connect("pty-session-1");

    // Simulate pty-output events
    store.applyOutput({
      sessionId: "pty-session-1",
      data: "Hello from Pi\r\n",
      timestamp: new Date().toISOString(),
    });
    store.applyOutput({
      sessionId: "pty-session-1",
      data: "$ ",
      timestamp: new Date().toISOString(),
    });

    expect(store.outputBuffer()).toContain("Hello from Pi");
    expect(store.outputBuffer()).toContain("$");
  });

  it("applyOutput accumulates data (session filtering is component-level)", () => {
    // Store is session-agnostic; CommsDeckPanel filters by sessionId
    // before calling applyOutput. This keeps the store simple and reusable.
    store.applyOutput({
      sessionId: "session-B",
      data: "some output\r\n",
      timestamp: new Date().toISOString(),
    });

    expect(store.outputBuffer()).toContain("some output");
  });

  it("transitions to Exited on process exit", () => {
    store.connect("pty-session-1");
    store.applyOutput({ sessionId: "pty-session-1", data: "output", timestamp: new Date().toISOString() });
    store.setExited(0);

    expect(store.status()).toBe("Exited");
    expect(store.exitCode()).toBe(0);
    expect(store.isActive()).toBe(true); // Still active (shows content)
    expect(store.isConnected()).toBe(false); // Not connected anymore
  });

  it("transitions to Error on failure", () => {
    store.connect("pty-session-1");
    store.setError("PTY write failed: broken pipe");

    expect(store.status()).toBe("Error");
    expect(store.errorMessage()).toContain("broken pipe");
  });

  it("respects scanLines config toggle", () => {
    expect(store.config().showScanLines).toBe(true);

    store.setConfig({ showScanLines: false });
    expect(store.config().showScanLines).toBe(false);
    // Other config stays unchanged
    expect(store.config().fontSize).toBe(14);
    expect(store.config().cursorBlink).toBe(true);
  });

  it("merges multiple config changes", () => {
    store.setConfig({ fontSize: 18, cursorBlink: false, theme: "light" as const });
    expect(store.config().fontSize).toBe(18);
    expect(store.config().cursorBlink).toBe(false);
    expect(store.config().theme).toBe("light");
    expect(store.config().cols).toBe(80); // unchanged
  });
});
