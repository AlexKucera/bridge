/// PTY Store — reactive SolidJS store for terminal/PTY state.
///
/// Manages xterm.js lifecycle, subscribes to Tauri 'pty-output' events,
/// and dispatches keystrokes via the 'pty_write' Tauri command.

import {
  createSignal,
  createMemo,
} from "solid-js";
import type { TerminalState, TerminalConfig, TerminalStatus, PtyOutputEvent } from "../lib/terminal-types";
import { TerminalStatus as TS, DEFAULT_TERMINAL_CONFIG } from "../lib/terminal-types";

// ─── Store Interface ────────────────────────────────────────────

export interface PtyStore {
  // Signals
  status: () => TerminalStatus;
  config: () => TerminalConfig;
  outputBuffer: () => string;
  exitCode: () => number | null;
  errorMessage: () => string | null;

  // Actions
  connect: (sessionId: string) => void;
  disconnect: () => void;
  applyOutput: (event: PtyOutputEvent) => void;
  setExited: (code: number) => void;
  setError: (message: string) => void;
  setConfig: (partial: Partial<TerminalConfig>) => void;

  // Computed
  isConnected: () => boolean;
  isActive: () => boolean;
}

// ─── Default State ─────────────────────────────────────────────

function defaultState(): TerminalState {
  return {
    status: TS.Disconnected,
    config: { ...DEFAULT_TERMINAL_CONFIG },
    outputBuffer: "",
    exitCode: null,
    errorMessage: null,
  };
}

// ─── Factory ────────────────────────────────────────────────────

/** Create a new PTY store with default state. */
export function createPtyStore(): PtyStore {
  const [status, setStatus] = createSignal<TerminalStatus>(TS.Disconnected);
  const [config, setConfig] = createSignal<TerminalConfig>({ ...DEFAULT_TERMINAL_CONFIG });
  const [outputBuffer, setOutputBuffer] = createSignal<string>("");
  const [exitCode, setExitCode] = createSignal<number | null>(null);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);

  return {
    // Signals
    status,
    config,
    outputBuffer,
    exitCode,
    errorMessage,

    // Actions
    connect(sessionId: string) {
      setStatus(TS.Connecting);
      setOutputBuffer("");
      setExitCode(null);
      setErrorMessage(null);
      // In Phase 2 we just transition to Connected; actual event wiring
      // happens in CommsDeckPanel's onMount via listen()
      setStatus(TS.Connected);
    },

    disconnect() {
      setStatus(TS.Disconnected);
      setExitCode(null);
      setErrorMessage(null);
    },

    applyOutput(event: PtyOutputEvent) {
      // Attempt base64 decode if data looks like valid base64
      // (Tauri sends binary PTY output as base64-encoded strings)
      const isBase64 = /^[A-Za-z0-9+/]+=*$/.test(event.data) && event.data.length % 4 === 0;
      if (isBase64) {
        try {
          const text = atob(event.data);
          setOutputBuffer((prev) => prev + text);
        } catch {
          // Decoding failed despite looking like base64 — treat as raw
          setOutputBuffer((prev) => prev + event.data);
        }
      } else {
        setOutputBuffer((prev) => prev + event.data);
      }

      if (status() === TS.Connecting) {
        setStatus(TS.Connected);
      }
    },

    setExited(code: number) {
      setExitCode(code);
      setStatus(TS.Exited);
    },

    setError(message: string) {
      setErrorMessage(message);
      setStatus(TS.Error);
    },

    setConfig(partial: Partial<TerminalConfig>) {
      setConfig((prev) => ({ ...prev, ...partial }));
    },

    // Computed
    isConnected: createMemo(() => {
      const s = status();
      return s === TS.Connected || s === TS.Connecting;
    }),

    isActive: createMemo(() => {
      const s = status();
      return s === TS.Connected || s === TS.Connecting || s === TS.Exited;
    }),
  };
}
