/// PiExecutionPanel — container component wrapping all execution view children.
///
/// Receives a PiExecutionStore and sessionId prop. Wires store signals
/// to SessionHeader, TurnList, SessionResultCard, and manages the overall layout.
/// Subscribes to Tauri `execution-update` and `session-complete` events on mount with cleanup.

import { onMount, onCleanup, createSignal } from "solid-js";
import type { Component } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import type { PiExecutionStore } from "../../store/pi-store";
import type { ExecutionUpdateEvent } from "../../store/pi-store";
import type { SessionResult } from "../../lib/execution-types";
import { isLiveTerminal } from "./LiveIndicator";
import { SessionHeader } from "./SessionHeader";
import { TurnList } from "./TurnList";
import { SessionResultCard } from "./SessionResultCard";

export interface PiExecutionPanelProps {
  store: PiExecutionStore;
  sessionId: string;
  /** Callback for "Review & Ship" — navigates to Cargo Panel */
  onReviewShip?: () => void;
  /** Callback for "Retry" — relaunches session */
  onRetry?: () => void;
  /** Callback for "Dismiss" — clears result card */
  onDismiss?: () => void;
}

export const PiExecutionPanel: Component<PiExecutionPanelProps> = (props) => {
  const model = () => props.store.model();
  const [result, setResult] = createSignal<SessionResult | null>(props.store.sessionResult());

  const isTerminal = () => isLiveTerminal(model().status);
  const showResult = () => isTerminal() && result() !== null;

  onMount(() => {
    // Initialize store model with our sessionId
    props.store.setModel({
      ...props.store.model(),
      sessionId: props.sessionId,
    });

    // Listen for execution-update events (existing behavior)
    const unlisten1 = listen<string>("execution-update", (event) => {
      try {
        // Tauri v2 may deliver payload as object or string
        const payload: ExecutionUpdateEvent = typeof event.payload === "string"
          ? JSON.parse(event.payload)
          : event.payload;
        // Only apply events destined for this session
        if (!payload.sessionId || payload.sessionId === props.sessionId) {
          props.store.applyEvent(payload);
        }
      } catch (e) {
        console.warn("[PiExecutionPanel] Failed to parse execution-update event:", e);
      }
    });

    // Listen for session-complete events (new: post-session finalization)
    const unlisten2 = listen<SessionResult>("session-complete", (event) => {
      try {
        const data = typeof event.payload === "string"
          ? JSON.parse(event.payload)
          : event.payload;
        setResult(data);
        props.store.setSessionResult(data);
      } catch (e) {
        console.warn("[PiExecutionPanel] Failed to parse session-complete event:", e);
      }
    });

    onCleanup(() => {
      unlisten1.then((fn) => fn());
      unlisten2.then((fn) => fn());
    });
  });

  return (
    <div class="execution-panel" data-testid="execution-panel" aria-label="Pi Execution View">
      <SessionHeader
        modelName={model().modelName}
        provider={model().provider}
        thinkingLevel={model().thinkingLevel}
        status={model().status}
        elapsedMs={model().elapsedMs}
      />

      <TurnList
        turns={model().turns}
        unknownEvents={model().unknownEvents}
        onToggleCollapse={(id) => props.store.toggleTurnCollapse(id)}
        onToggleThinking={() => {}}
        onToggleToolCall={(turnId, tcId) => props.store.toggleToolCallVisibility(turnId, tcId)}
      />

      {showResult() && (
        <SessionResultCard
          result={result()!}
          callbacks={{
            onReviewShip: () => props.onReviewShip?.(),
            onRetry: () => props.onRetry?.(),
            onDismiss: () => {
              setResult(null);
              props.store.clearSessionResult();
              props.onDismiss?.();
            },
          }}
        />
      )}
    </div>
  );
};
