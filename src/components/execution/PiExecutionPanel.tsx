/// PiExecutionPanel — container component wrapping all execution view children.
///
/// Receives a PiExecutionStore and sessionId prop. Wires store signals
/// to SessionHeader, TurnList, and manages the overall layout.
/// Subscribes to Tauri `execution-update` events on mount with cleanup.

import { onMount, onCleanup } from "solid-js";
import type { Component } from "solid-js";
import { listen } from "@tauri-apps/api/event";
import type { PiExecutionStore } from "../../store/pi-store";
import type { ExecutionUpdateEvent } from "../../store/pi-store";
import { SessionHeader } from "./SessionHeader";
import { TurnList } from "./TurnList";

export interface PiExecutionPanelProps {
  store: PiExecutionStore;
  sessionId: string;
}

export const PiExecutionPanel: Component<PiExecutionPanelProps> = (props) => {
  const model = () => props.store.model();

  onMount(() => {
    // Initialize store model with our sessionId
    props.store.setModel({
      ...props.store.model(),
      sessionId: props.sessionId,
    });

    const unlisten = listen<string>("execution-update", (event) => {
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
        // Malformed event payload — log but don't crash
        console.warn("[PiExecutionPanel] Failed to parse execution-update event:", e);
      }
    });

    onCleanup(() => {
      unlisten.then((fn) => fn());
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
    </div>
  );
};
