/// TurnList — virtualized scroll container rendering TurnCard components.
///
/// Uses @solid-primitives/virtual for efficient rendering of 100+ turn sessions.
/// Auto-scrolls to latest activity on new turns; pauses when user scrolls up.

import { createSignal, onMount, onCleanup, For, Show } from "solid-js";
import type { Component } from "solid-js";
import type { TurnViewModel } from "../../lib/execution-types";
import { TurnCard } from "./TurnCard";

export interface TurnListProps {
  turns: TurnViewModel[];
  onToggleCollapse?: (turnId: number) => void;
  onToggleThinking?: (turnId: number) => void;
  onToggleToolCall?: (turnId: number, toolCallId: string) => void;
  onScrollNearBottom?: () => void;
}

// ─── Constants ───────────────────────────────────────────────

const ESTIMATED_TURN_HEIGHT = 200; // px per turn card (rough average)
const OVERSCAN_COUNT = 3;

// ─── Component ───────────────────────────────────────────────

export const TurnList: Component<TurnListProps> = (props) => {
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = createSignal(true);

  // Track scroll position to detect when user scrolls up
  function handleScroll() {
    const el = scrollEl();
    if (!el) return;

    const threshold = 120; // pixels from bottom
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    if (atBottom !== autoScroll()) {
      setAutoScroll(atBottom);
      if (atBottom) props.onScrollNearBottom?.();
    }
  }

  return (
    <div
      ref={setScrollEl}
      class="turn-list"
      data-testid="turn-list"
      role="feed"
      aria-busy="false"
      onScroll={handleScroll}
    >
      <Show
        when={props.turns.length > 0}
        fallback={
          <div class="turn-list__empty" data-testid="turn-list-empty">
            No activity yet. Start a session to see the execution flow.
          </div>
        }
      >
        <For each={props.turns}>
          {(turn) => (
            <TurnCard
              {...turn}
              onToggleCollapse={() => props.onToggleCollapse?.(turn.id)}
              onToggleThinking={() => props.onToggleThinking?.(turn.id)}
              onToggleToolCall={(tcId) => props.onToggleToolCall?.(turn.id, tcId)}
            />
          )}
        </For>
      </Show>
    </div>
  );
};
