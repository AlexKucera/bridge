/// CommsDeckPanel — Terminal view for PTY sessions (The Comms Deck).
///
/// Integrates xterm.js for terminal rendering, subscribes to Tauri
/// 'pty-output' events, dispatches keystrokes via 'pty_write', and
/// overlays a CRT scan-line animation.
///
/// Lifecycle:
///   onMount → create Terminal + FitAddon, listen('pty-output'), focus
///   onCleanup → dispose Terminal, unlisten, remove resize observer
///
/// Data flow:
///   Rust PTY stdout → mpsc → Tauri app.emit("pty-output") → here → term.write()
///   User keystrokes → keydown event → invoke("pty_write", { data }) → Rust PTY stdin

import { onMount, onCleanup, createSignal, Show } from "solid-js";
import { type Component } from "solid-js";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./comms-deck.css";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import type { PtyStore } from "../../store/pty-store";
import { ScanLineOverlay } from "./ScanLineOverlay";
import { classifyAndColorize } from "../../lib/log-line-classifier";

// ─── Props ─────────────────────────────────────────────────────

export interface CommsDeckPanelProps {
  store: PtyStore;
  sessionId: string;
}

// ─── Component ─────────────────────────────────────────────────

export const CommsDeckPanel: Component<CommsDeckPanelProps> = (props) => {
  let terminalContainer: HTMLDivElement | undefined;
  let term: Terminal | undefined;
  let fitAddon: FitAddon | undefined;
  let resizeObserver: ResizeObserver | undefined;

  // Track whether we've received any output (for initial blank state)
  const [hasOutput, setHasOutput] = createSignal(false);

  onMount(() => {
    // Mark session as connected in store
    props.store.connect(props.sessionId);

    // ── Create xterm.js instance ──
    const config = props.store.config();
    term = new Terminal({
      fontSize: config.fontSize,
      fontFamily: config.fontFamily,
      cursorBlink: config.cursorBlink,
      theme: config.theme === "dark"
        ? {
            background: "#0a0e14",
            foreground: "#b3b1ad",
            cursor: "#ff9940",
            selectionBackground: "#1f2430",
            black: "#1d2026",
            red: "#c5797b",
            green: "#7bc477",
            yellow: "#c5b86f",
            blue: "#7aa2ca",
            magenta: "#ba8caf",
            cyan: "#8cc2c8",
            white: "#b3b1ad",
            brightBlack: "#62666e",
            brightRed: "#e59191",
            brightGreen: "#8cd98a",
            brightYellow: "#eada90",
            brightBlue: "#93bbec",
            brightMagenta: "#d0aad0",
            brightCyan: "#a5d5de",
            brightWhite:("#ffffff" as unknown as string),
          }
        : {
            background: "#ffffff",
            foreground: "#383a42",
            cursor: "#528bff",
            selectionBackground: "#add6ff26",
            black: "#383a42",
            red: "#e45649",
            green: "#50a14f",
            yellow: "#c18401",
            blue: "#4078f2",
            magenta: "#a626a4",
            cyan: "#0184bc",
            white: "#a0a1a7",
            brightBlack: "#4f525e",
            brightRed: "#e06c75",
            brightGreen: "#98c379",
            brightYellow: "#e5c07b",
            brightBlue: "#61afef",
            brightMagenta: "#c678dd",
            brightCyan: "#56b6c2",
            brightWhite: ("#ffffff" as unknown as string),
          },
      rows: config.rows,
      cols: config.cols,
      allowProposedApi: true,
    });

    fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    // Open terminal into DOM container
    if (terminalContainer) {
      term.open(terminalContainer);
      // Initial fit to container size
      fitAddon.fit();
    }

    // ── Subscribe to PTY output events ──
    const unlistenPty = listen<string>("pty-output", (event) => {
      try {
        const payload = JSON.parse(event.payload);
        // Only process events for our session
        if (!payload.sessionId || payload.sessionId === props.sessionId) {
          const data = payload.data || "";
          // Decode base64 if needed
          let text: string;
          if (/^[A-Za-z0-9+/]+=*$/.test(data) && data.length % 4 === 0) {
            try {
              text = atob(data);
            } catch {
              text = data;
            }
          } else {
            text = data;
          }

if (text.length > 0 && term) {
            const colored = classifyAndColorize(text);
            term.write(colored);
            setHasOutput(true);
            // Auto-fit after receiving output (in case of initial render)
            requestAnimationFrame(() => fitAddon?.fit());
          }
        }
      } catch (e) {
        console.warn("[CommsDeckPanel] Failed to parse pty-output event:", e);
      }
    });

    // ── Subscribe to PTY exit events ──
    const unlistenExit = listen<{ code: number; sessionId: string }>(
      "pty-exit",
      (event) => {
        try {
          const payload = typeof event.payload === "string"
            ? JSON.parse(event.payload)
            : event.payload;
          if (!payload.sessionId || payload.sessionId === props.sessionId) {
            props.store.setExited(payload.code ?? 0);
            if (term) {
              term.write(`\r\n\x1b[90m[Process exited with code ${payload.code ?? 0}]\x1b[0m\r\n`);
            }
          }
        } catch (e) {
          console.warn("[CommsDeckPanel] Failed to parse pty-exit event:", e);
        }
      }
    );

    // ── Keyboard input → pty_write ──
    const handleKeydown = (ev: KeyboardEvent) => {
      // Only capture when terminal is focused and session is active
      if (!props.store.isConnected()) return;

      const data = ev.key;
      // Don't intercept Tab (let browser handle it for accessibility)
      if (data === "Tab") return;

      ev.preventDefault();
      ev.stopPropagation();

      invoke("pty_write", { sessionId: Number(props.sessionId), data })
        .catch((err) => {
          console.warn("[CommsDeckPanel] pty_write failed:", err);
          props.store.setError(String(err));
        });
    };

    // Attach keyboard listener to the terminal container
    terminalContainer?.addEventListener("keydown", handleKeydown);

    // ── ResizeObserver for responsive fitting ──
    resizeObserver = new ResizeObserver(() => {
      fitAddon?.fit();
    });
    if (terminalContainer) {
      resizeObserver.observe(terminalContainer);
    }

    // Focus terminal on mount
    term?.focus();

    // ── Cleanup ──
    onCleanup(async () => {
      terminalContainer?.removeEventListener("keydown", handleKeydown);
      resizeObserver?.disconnect();

      const unlistenPtyFn = await unlistenPty;
      unlistenPtyFn();

      const unlistenExitFn = await unlistenExit;
      unlistenExitFn();

      term?.dispose();
      props.store.disconnect();
    });
  });

  return (
    <div
      class="comms-deck-panel"
      data-testid="comms-deck-panel"
      aria-label="Terminal"
    >
      {/* Status bar */}
      <div class="comms-deck-panel__status-bar" data-testid="comms-deck-status">
        <Show when={props.store.status() === "Connected"}>
          <span class="comms-deck-panel__status-dot comms-deck-panel__status-dot--active" />
          <span class="comms-deck-panel__status-text">PTY Active</span>
        </Show>
        <Show when={props.store.status() === "Exited"}>
          <span class="comms-deck-panel__status-dot comms-deck-panel__status-dot--exited" />
          <span class="comms-deck-panel__status-text">
            Exited ({props.store.exitCode()})
          </span>
        </Show>
        <Show when={props.store.status() === "Error"}>
          <span class="comms-deck-panel__status-dot comms-deck-panel__status-dot--error" />
          <span class="comms-deck-panel__status-text">Error</span>
        </Show>
        <Show when={props.store.status() === "Disconnected"}>
          <span class="comms-deck-panel__status-dot" />
          <span class="comms-deck-panel__status-text">Disconnected</span>
        </Show>
        <Show when={props.store.errorMessage()}>
          <span class="comms-deck-panel__error-msg">
            {props.store.errorMessage()}
          </span>
        </Show>
      </div>

      {/* Terminal container */}
      <div
        ref={terminalContainer}
        class="comms-deck-panel__terminal"
        data-testid="comms-deck-terminal"
      />

      {/* Scan-line overlay */}
      <ScanLineOverlay visible={props.store.config().showScanLines} />

      {/* Empty state (before first output) */}
      <Show when={!hasOutput() && props.store.isConnected()}>
        <div class="comms-deck-panel__empty-state" data-testid="comms-deck-empty">
          <span class="comms-deck-panel__empty-icon">▶</span>
          <span>Waiting for output…</span>
        </div>
      </Show>
    </div>
  );
};
