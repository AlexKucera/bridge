/// TruncatedText — client-side text truncation with expand/collapse reveal.
///
/// When text exceeds `truncateAt` bytes, shows a truncated preview
/// with "[truncated -- click to expand]" reveal. Clicking expands
/// to show the full text with a collapse option.

import { createSignal } from "solid-js";
import type { Component } from "solid-js";

export interface TruncatedTextProps {
  text: string;
  truncateAt?: number; // default: 50_000 (50KB)
}

const DEFAULT_TRUNCATE = 50_000;
const TRUNCATION_MARKER = "\n\n[truncated -- click to expand]";

/** Calculate byte length of a string (UTF-8). */
function byteLength(s: string): number {
  // In JavaScript, strings are UTF-16; use Blob for accurate byte count
  return new Blob([s]).size;
}

export const TruncatedText: Component<TruncatedTextProps> = (props) => {
  const limit = () => props.truncateAt ?? DEFAULT_TRUNCATE;
  const needsTruncation = () => byteLength(props.text) > limit();
  const [expanded, setExpanded] = createSignal(false);

  /** Get the display text (truncated or full). */
  function displayText(): string {
    if (!needsTruncation() || expanded()) return props.text;

    // Binary search for the truncation point near the byte limit
    let lo = 0;
    let hi = props.text.length;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (byteLength(props.text.slice(0, mid)) <= limit()) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }

    return props.text.slice(0, lo) + TRUNCATION_MARKER;
  }

  return (
    <span class="truncated-text" data-testid="truncated-text">
      {displayText()}

      {needsTruncation() && (
        <button
          class="truncated-text__toggle"
          onClick={() => setExpanded(!expanded())}
          type="button"
          aria-expanded={expanded()}
        >
          {expanded()
            ? "↑ Collapse"
            : "↓ Expand (show full text)"}
        </button>
      )}
    </span>
  );
};
