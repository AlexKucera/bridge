import { createMemo } from "solid-js";
import type { Component } from "solid-js";

interface Props {
  value: string;
  onInput: (value: string) => void;
  disabled?: boolean;
}

const CommitMessageEditor: Component<Props> = (props) => {
  const charCount = () => props.value.length;
  const lineLengths = () =>
    props.value
      .split("\n")
      .map((l) => l.length);
  const maxLineLength = () => Math.max(...lineLengths(), 0);
  const isOverLimit = () => maxLineLength() > 72;

  return (
    <div class="cargo-commit-editor" data-testid="cargo-editor">
      <textarea
        classList={{
          "cargo-textarea": true,
          "cargo-textarea-overlimit": isOverLimit(),
        }}
        data-testid="cargo-textarea"
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
        placeholder="Commit message..."
        disabled={props.disabled}
        rows={4}
      />
      <div class="cargo-editor-meta" data-testid="cargo-editor-meta">
        <span classList={{ "cargo-overlimit-warning": isOverLimit() }}>
          {charCount()} chars · max line: {maxLineLength()}
          {isOverLimit() && " ⚠️ over 72"}
        </span>
      </div>
    </div>
  );
};

export default CommitMessageEditor;
