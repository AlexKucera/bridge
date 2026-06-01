/// TurnList — virtualized scroll container rendering TurnCard components.
///
/// Uses @solid-primitives/virtual for efficient rendering of 100+ turn sessions.
/// Auto-scrolls to latest activity on new turns; pauses when user scrolls up.
/// Falls back to non-virtualized rendering for small turn counts (< 10).

import { createSignal, createEffect, For, Show } from "solid-js";
import type { Component } from "solid-js";
import type { TurnViewModel } from "../../lib/execution-types";
import { TurnCard } from "./TurnCard";
import { UnknownEventCard } from "./UnknownEventCard";
import { VirtualList } from "@solid-primitives/virtual";

export interface TurnListProps {
  turns: TurnViewModel[];
  unknownEvents?: Record<string, unknown>[];
  onToggleCollapse?: (turnId: number) => void;
  onToggleThinking?: (turnId: number) => void;
  onToggleToolCall?: (turnId: number, toolCallId: string) => void;
  onScrollNearBottom?: () => void;
}

// ─── Constants ───────────────────────────────────────────────

const ESTIMATED_TURN_HEIGHT = 200; // px per turn card (rough average)
const OVERSCAN_COUNT = 3;
const VIRTUALIZATION_THRESHOLD = 10; // only virtualize above this count

// ─── Component ───────────────────────────────────────────────

export const TurnList: Component<TurnListProps> = (props) => {
  const [scrollEl, setScrollEl] = createSignal<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = createSignal(true);
  const shouldVirtualize = () => props.turns.length > VIRTUALIZATION_THRESHOLD;

  // Track scroll position to detect when user scrolls up
  function handleScroll(e: Event) {
    const el = scrollEl();
    if (!el) return;

    const threshold = 120; // pixels from bottom
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    if (atBottom !== autoScroll()) {
      setAutoScroll(atBottom);
      if (atBottom) props.onScrollNearBottom?.();
    }
  }

  // Auto-scroll to bottom when new activity arrives (turns or unknown events)
  createEffect(() => {
    const _turnCount = props.turns.length;
    const _unknownCount = props.unknownEvents?.length ?? 0;
    if (!autoScroll()) return;
    const el = scrollEl();
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  });

  /** Render a single turn as a TurnCard with callbacks wired. */
  function renderTurn(turn: TurnViewModel) {
    return (
      <TurnCard
        id={turn.id}
        role={turn.role}
        promptText={turn.promptText}
        thinkingText={turn.thinkingText}
        responseText={turn.responseText}
        toolCalls={turn.toolCalls}
        metrics={turn.metrics}
        isCollapsed={turn.isCollapsed}
        onToggleCollapse={() => props.onToggleCollapse?.(turn.id)}
        onToggleThinking={() => props.onToggleThinking?.(turn.id)}
        onToggleToolCall={(tcId) => props.onToggleToolCall?.(turn.id, tcId)}
      />
    );
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
        <Show
          when={shouldVirtualize()}
          fallback={
            /* Non-virtualized path: render all turns directly */
            <For each={props.turns}>{renderTurn}</For>
          }
        >
          {/* Virtualized path: only render visible + overscan items */}
          <VirtualList
            each={props.turns}
            overscanCount={OVERSCAN_COUNT}
            rootHeight={800}
            rowHeight={ESTIMATED_TURN_HEIGHT}
          >
            {(turn) => renderTurn(turn)}
          </VirtualList>
        </Show>
      </Show>

      {/* Unknown/future event types — forward-compat rendering */}
      <Show when={props.unknownEvents && props.unknownEvents.length > 0}>
        <For each={props.unknownEvents!}>
          {(event) => (
            <UnknownEventCard event={event} />
          )}
        </For>
      </Show>
    </div>
  );
};
