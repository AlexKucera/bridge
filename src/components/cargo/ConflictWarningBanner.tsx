import { Show } from "solid-js";
import type { Component } from "solid-js";

interface Props {
  hasConflicts: boolean;
  mergeInProgress: boolean;
}

const ConflictWarningBanner: Component<Props> = (props) => {
  const show = () => props.hasConflicts || props.mergeInProgress;

  return (
    <Show when={show()}>
      <div class="cargo-conflict-banner" data-testid="cargo-conflict-banner">
        <span class="cargo-conflict-icon">⚠</span>
        <span class="cargo-conflict-text">
          {props.mergeInProgress
            ? "Cannot Set Sail — merge in progress"
            : "Cannot Set Sail — resolve merge conflicts first"}
        </span>
      </div>
    </Show>
  );
};

export default ConflictWarningBanner;
