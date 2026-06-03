/// Pi Execution Store — reactive SolidJS store for execution view state.
///
/// Holds the ExecutionViewModel reactively via signals and provides
/// actions for user interaction (select, collapse, toggle, reset, prefs).

import {
  createSignal,
  createMemo,
} from "solid-js";
import {
  type ExecutionViewModel,
  type UiPrefs,
  DEFAULT_UI_PREFS,
  LiveState,
  type SessionResult,
} from "../lib/execution-types";

// ─── Store Interface ────────────────────────────────────────

export interface PiExecutionStore {
  // Signals
  model: () => ExecutionViewModel;
  setModel: (model: ExecutionViewModel) => void;
  selectedTurnId: () => number | null;
  setSelectedTurnId: (id: number | null) => void;
  collapsedTurns: () => Set<number>;
  hiddenToolCalls: () => Set<string>;
  uiPrefs: () => UiPrefs;
  setUiPrefs: (prefs: UiPrefs) => void;

  // Actions
  selectTurn: (id: number) => void;
  toggleTurnCollapse: (id: number) => void;
  toggleToolCallVisibility: (turnId: number, toolCallId: string) => void;
  reset: () => void;
  setUiPref: <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => void;

  // Event processing
  applyEvent: (event: ExecutionUpdateEvent) => void;

  // Computed
  isSessionActive: () => boolean;
}

// ─── Session Result (post-session) ─────────────────────────────
export interface SessionResultStore {
  sessionResult: () => SessionResult | null;
  setSessionResult: (result: SessionResult | null) => void;
  clearSessionResult: () => void;
}

// ─── Execution Update Event ───────────────────────────────────

/** Event payload received from Tauri on the 'execution-update' channel. */
export interface ExecutionUpdateEvent {
  type: string;
  sessionId?: string;
  status?: string;
  turnId?: number;
  role?: string;
  promptText?: string;
  thinkingDelta?: string;
  textDelta?: string;
}

// ─── Default Model ──────────────────────────────────────────

function defaultModel(): ExecutionViewModel {
  return {
    sessionId: "",
    modelName: "",
    provider: "",
    thinkingLevel: "",
    status: LiveState.Queued,
    startedAt: undefined,
    elapsedMs: 0,
    totalTokens: 0,
    totalCost: 0,
    turns: [],
    unknownEvents: [],
    sessionResult: null as SessionResult | null,
  };
}

// ─── Factory ────────────────────────────────────────────────

/** Create a new Pi execution store with default state. */
export function createPiExecutionStore(): PiExecutionStore {
  const [model, setModel] = createSignal<ExecutionViewModel>(defaultModel());
  const [selectedTurnId, setSelectedTurnId] = createSignal<number | null>(null);
  const [collapsedTurns, setCollapsedTurns] = createSignal<Set<number>>(new Set());
  const [hiddenToolCalls, setHiddenToolCalls] = createSignal<Set<string>>(new Set());
  const [uiPrefs, setUiPrefsSignal] = createSignal<UiPrefs>({ ...DEFAULT_UI_PREFS });
  const [sessionResultSignal, setSessionResultSignal] = createSignal<SessionResult | null>(null);

  return {
    // Signals
    model,
    setModel,
    selectedTurnId,
    setSelectedTurnId,
    collapsedTurns,
    hiddenToolCalls,
    uiPrefs,
    setUiPrefs: setUiPrefsSignal,

    // Actions
    selectTurn(id: number) {
      setSelectedTurnId(id);
    },

    toggleTurnCollapse(id: number) {
      setCollapsedTurns((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },

    toggleToolCallVisibility(turnId: number, toolCallId: string) {
      setHiddenToolCalls((prev) => {
        const next = new Set(prev);
        const key = `${turnId}:${toolCallId}`;
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
    },

    reset() {
      setModel(defaultModel());
      setSelectedTurnId(null);
      setCollapsedTurns(new Set());
      setHiddenToolCalls(new Set());
      setUiPrefsSignal({ ...DEFAULT_UI_PREFS });
    },

    setUiPref<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) {
      setUiPrefsSignal((prev) => ({ ...prev, [key]: value }));
    },

    applyEvent(event: ExecutionUpdateEvent) {
      setModel((prev) => {
        const next = { ...prev };

        switch (event.type) {
          case "status_changed":
            if (event.sessionId) next.sessionId = event.sessionId;
            if (event.status) next.status = event.status as LiveState;
            break;

          case "new_turn":
            if (event.turnId !== undefined) {
              const newTurn = {
                id: event.turnId,
                role: "",
                promptText: "",
                thinkingText: "",
                responseText: "",
                toolCalls: [],
                metrics: { tokensUsed: 0, costUsd: 0, toolCallCount: 0, durationMs: 0 },
                isCollapsed: false,
              };
              next.turns = [...next.turns, newTurn];
            }
            break;

          case "turn_updated":
            if (event.turnId !== undefined && next.turns[event.turnId]) {
              const turn = { ...next.turns[event.turnId] };
              if (event.role !== undefined) turn.role = event.role;
              if (event.promptText !== undefined) turn.promptText = event.promptText;
              if (event.thinkingDelta !== undefined)
                turn.thinkingText = turn.thinkingText + event.thinkingDelta;
              if (event.textDelta !== undefined)
                turn.responseText = turn.responseText + event.textDelta;
              next.turns = next.turns.map((t, i) => i === event.turnId! ? turn : t);
            }
            break;

          default:
            // Capture unknown/future event types for forward-compat rendering
            next.unknownEvents = [...next.unknownEvents, event];
            break;
        }

        return next;
      });
    },

    // Computed
    isSessionActive: createMemo(() => {
      const s = model().status;
      return s === LiveState.Idle
        || s === LiveState.Thinking
        || s === LiveState.RunningTool
        || s === LiveState.StreamingText
        || s === LiveState.Starting;
    }),

    sessionResult: () => sessionResultSignal(),

    setSessionResult(result: SessionResult | null) {
      setSessionResultSignal(result);
    },

    clearSessionResult() {
      setSessionResultSignal(null);
    },
  };
}
