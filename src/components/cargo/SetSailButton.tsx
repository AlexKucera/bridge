import { Show } from "solid-js";
import type { Component } from "solid-js";

interface Props {
  onClick: () => void;
  isCommitting: boolean;
  disabled?: boolean;
}

const SetSailButton: Component<Props> = (props) => {
  return (
    <button
      class="cargo-set-sail-btn"
      data-testid="cargo-set-sail"
      onClick={props.onClick}
      disabled={props.disabled || props.isCommitting}
    >
      <Show
        when={props.isCommitting}
        fallback={
          <>
            <span class="cargo-anchor-icon">⚓</span>
            Set Sail
          </>
        }
      >
        <span class="cargo-spinner" data-testid="cargo-spinner" />
        Sailing...
      </Show>
    </button>
  );
};

export default SetSailButton;
