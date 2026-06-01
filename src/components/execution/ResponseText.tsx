/// ResponseText — renders assistant response text.
///
/// Uses monospace font for code-like content. Streaming animation
/// is wired in Slice 8; this slice handles static rendering only.

import type { Component } from "solid-js";

export interface ResponseTextProps {
  text: string;
}

export const ResponseText: Component<ResponseTextProps> = (props) => {
  return (
    <article class="response-text" data-testid="response-text">
      {props.text || (
        <span class="response-text__empty" aria-label="Empty response">
          &nbsp;
        </span>
      )}
    </article>
  );
};
