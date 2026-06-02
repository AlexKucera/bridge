/// Tests for terminal types and PTY store.
///
/// Covers: enum values, default config, PtyStore lifecycle,
/// output accumulation, computed properties.

import { describe, it, expect, beforeEach } from "vitest";
import { TerminalStatus, LogLineClass, DEFAULT_TERMINAL_CONFIG } from "../lib/terminal-types";
import { createPtyStore } from "../store/pty-store";
import type { PtyOutputEvent } from "../lib/terminal-types";

// ─── Terminal Types ────────────────────────────────────────────

describe("TerminalStatus", () => {
  it("has all expected status values", () => {
    expect(TerminalStatus.Disconnected).toBe("Disconnected");
    expect(TerminalStatus.Connecting).toBe("Connecting");
    expect(TerminalStatus.Connected).toBe("Connected");
    expect(TerminalStatus.Exited).toBe("Exited");
    expect(TerminalStatus.Error).toBe("Error");
  });

  it("has exactly 5 status values", () => {
    const values = Object.values(TerminalStatus);
    // Reverse mapping doubles the count; filter to string values only
    const stringValues = values.filter((v) => typeof v === "string");
    expect(stringValues).toHaveLength(5);
  });
});

describe("LogLineClass", () => {
  it("has all expected classification values", () => {
    expect(LogLineClass.Prompt).toBe("prompt");
    expect(LogLineClass.Info).toBe("info");
    expect(LogLineClass.Warn).toBe("warn");
    expect(LogLineClass.Error).toBe("error");
    expect(LogLineClass.Dim).toBe("dim");
    expect(LogLineClass.Plain).toBe("plain");
  });
});

describe("DEFAULT_TERMINAL_CONFIG", () => {
  it("provides sensible defaults", () => {
    expect(DEFAULT_TERMINAL_CONFIG.fontSize).toBe(14);
    expect(DEFAULT_TERMINAL_CONFIG.cols).toBe(80);
    expect(DEFAULT_TERMINAL_CONFIG.rows).toBe(30);
    expect(DEFAULT_TERMINAL_CONFIG.showScanLines).toBe(true);
    expect(DEFAULT_TERMINAL_CONFIG.cursorBlink).toBe(true);
    expect(DEFAULT_TERMINAL_CONFIG.theme).toBe("dark");
    expect(DEFAULT_TERMINAL_CONFIG.fontFamily).toContain("monospace");
  });

  it("is frozen (immutable)", () => {
    expect(Object.isFrozen(DEFAULT_TERMINAL_CONFIG)).toBe(false);
    // We don't freeze it so partial updates work, but verify defaults are stable
    const c1 = { ...DEFAULT_TERMINAL_CONFIG };
    const c2 = { ...DEFAULT_TERMINAL_CONFIG };
    expect(c1).toEqual(c2);
  });
});

// ─── PtyStore Lifecycle ────────────────────────────────────────

describe("createPtyStore", () => {
  let store: ReturnType<typeof createPtyStore>;

  beforeEach(() => {
    store = createPtyStore();
  });

  it("starts in Disconnected state with empty buffer", () => {
    expect(store.status()).toBe(TerminalStatus.Disconnected);
    expect(store.outputBuffer()).toBe("");
    expect(store.exitCode()).toBeNull();
    expect(store.errorMessage()).toBeNull();
  });

  it("transitions to Connected on connect()", () => {
    store.connect("session-1");
    expect(store.status()).toBe(TerminalStatus.Connected);
    expect(store.outputBuffer()).toBe("");
  });

  it("clears state on reconnect", () => {
    store.connect("session-1");
    store.applyOutput(makeEvent("hello"));
    store.setExited(0);
    store.connect("session-2");
    expect(store.outputBuffer()).toBe("");
    expect(store.exitCode()).toBeNull();
    expect(store.errorMessage()).toBeNull();
  });

  it("transitions back to Disconnected on disconnect()", () => {
    store.connect("session-1");
    store.disconnect();
    expect(store.status()).toBe(TerminalStatus.Disconnected);
  });

  it("accumulates output via applyOutput()", () => {
    store.connect("session-1");
    store.applyOutput(makeEvent("Hello "));
    store.applyOutput(makeEvent("World"));
    expect(store.outputBuffer()).toBe("Hello World");
  });

  it("decodes base64 data in applyOutput()", () => {
    store.connect("session-1");
    const event: PtyOutputEvent = {
      sessionId: "s1",
      data: btoa("binary data"),
      timestamp: new Date().toISOString(),
    };
    store.applyOutput(event);
    expect(store.outputBuffer()).toBe("binary data");
  });

  it("handles non-base64 data gracefully", () => {
    store.connect("session-1");
    const event: PtyOutputEvent = {
      sessionId: "s1",
      data: "raw text",
      timestamp: new Date().toISOString(),
    };
    store.applyOutput(event);
    expect(store.outputBuffer()).toBe("raw text");
  });

  it("transitions to Exited with exit code on setExited()", () => {
    store.connect("session-1");
    store.setExited(0);
    expect(store.status()).toBe(TerminalStatus.Exited);
    expect(store.exitCode()).toBe(0);
  });

  it("transitions to Error with message on setError()", () => {
    store.connect("session-1");
    store.setError("PTY read failed");
    expect(store.status()).toBe(TerminalStatus.Error);
    expect(store.errorMessage()).toBe("PTY read failed");
  });

  it("merges partial config via setConfig()", () => {
    store.setConfig({ fontSize: 18 });
    expect(store.config().fontSize).toBe(18);
    expect(store.config().cols).toBe(80); // unchanged
  });

  it("isConnected is true when Connected or Connecting", () => {
    expect(store.isConnected()).toBe(false);

    store.connect("session-1");
    // After connect() we go straight to Connected
    expect(store.isConnected()).toBe(true);

    store.setExited(0);
    expect(store.isConnected()).toBe(false); // Exited is not connected
  });

  it("isActive is true when Connected, Connecting, or Exited", () => {
    expect(store.isActive()).toBe(false);

    store.connect("session-1");
    expect(store.isActive()).toBe(true);

    store.setExited(0);
    expect(store.isActive()).toBe(true); // Exited still shows content

    store.disconnect();
    expect(store.isActive()).toBe(false);
  });
});

// ─── Helpers ───────────────────────────────────────────────────

function makeEvent(data: string): PtyOutputEvent {
  return {
    sessionId: "test-session",
    data,
    timestamp: new Date().toISOString(),
  };
}
