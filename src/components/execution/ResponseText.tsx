/// ResponseText — renders assistant response text with optional streaming animation.
///
/// When `isStreaming=true`, only `streamedCharCount` characters are shown
/// with a blinking cursor at the end. When complete, cursor disappears
/// and full static text renders.

import type { Component } from "solid-js";
import { createMemo } from "solid-js";

export interface ResponseTextProps {
  /** Full text content (available once streaming completes). */
  text: string;
  /** Whether text is currently being streamed character-by-character. */
  isStreaming?: boolean;
  /** Number of characters rendered so far (only used when isStreaming=true). Ignored when -1. */
  streamedCharCount?: number;
}

/** Extract visible text based on streaming state. */
function visibleText(text: string, isStreaming: boolean, charCount: number): string {
  if (!isStreaming) return text;
  if (charCount < 0) return text;
  return text.slice(0, charCount);
}

export const ResponseText: Component<ResponseTextProps> = (props) => {
  const displayText = createMemo(() =>
    visibleText(props.text, !!props.isStreaming, props.streamedCharCount ?? -1)
  );

  return (
    <article class="response-text" data-testid="response-text">
      {displayText() || (
        <span class="response-text__empty" aria-label="Empty response">
          &nbsp;
        </span>
      )}
      {props.isStreaming && (
        <span class="response-text__cursor" data-testid="streaming-cursor" aria-hidden="true" />
      )}
    </article>
  );
};
