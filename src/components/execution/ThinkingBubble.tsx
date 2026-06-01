/// ThinkingBubble — collapsible section showing Pi's reasoning text.
///
/// Collapsed shows "Thinking..." with a dot animation.
/// Expanded shows the full text content.

import type { Component } from "solid-js";

export interface ThinkingBubbleProps {
  text: string;
  isCollapsed: boolean;
  onToggle?: () => void;
}

export const ThinkingBubble: Component<ThinkingBubbleProps> = (props) => {
  return (
    <div
      class="thinking-bubble"
      classList={{ "thinking-bubble--collapsed": props.isCollapsed }}
      data-testid="thinking-bubble"
    >
      <button
        class="thinking-bubble__toggle"
        onClick={props.onToggle}
        aria-expanded={!props.isCollapsed}
        aria-label="Toggle thinking"
        type="button"
      >
        <span class="thinking-bubble__label">
          {props.isCollapsed ? "Thinking..." : "Thinking"}
        </span>
        {!props.isCollapsed && (
          <span class="thinking-bubble__text">{props.text}</span>
        )}
      </button>
    </div>
  );
};
