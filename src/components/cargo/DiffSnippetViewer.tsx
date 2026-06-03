import { createMemo, For, Show } from "solid-js";
import type { Component } from "solid-js";
import type { FileDiff } from "../../lib/cargo-types";

interface Props {
  fileDiff: FileDiff | null;
}

const DiffSnippetViewer: Component<Props> = (props) => {
  const lines = createMemo(() => {
    if (!props.fileDiff?.snippet) return [];
    return props.fileDiff.snippet.split("\n");
  });

  return (
    <div class="cargo-diff-viewer" data-testid="cargo-diff-viewer">
      <Show
        when={props.fileDiff}
        fallback={
          <div class="cargo-diff-empty" data-testid="cargo-diff-empty">
            Select a file to view its diff
          </div>
        }
      >
        <div class="cargo-diff-header" data-testid="cargo-diff-header">
          <span class="cargo-diff-path">{props.fileDiff!.path}</span>
          <span class="cargo-diff-stats">
            <span class="cargo-stat-add">+{props.fileDiff!.additions}</span>
            <span class="cargo-stat-del">−{props.fileDiff!.deletions}</span>
          </span>
        </div>
        <pre class="cargo-diff-content" data-testid="cargo-diff-content">
          <For each={lines()}>
            {(line) => {
              const lineClass = () => {
                if (line.startsWith("+") && !line.startsWith("+++")) return "diff-line-add";
                if (line.startsWith("-") && !line.startsWith("---")) return "diff-line-del";
                if (line.startsWith("@@")) return "diff-line-hunk";
                return "diff-line-context";
              };
              return (
                <div class={lineClass()} data-testid="diff-line">
                  {line || "\u00A0"}
                </div>
              );
            }}
          </For>
        </pre>
      </Show>
    </div>
  );
};

export default DiffSnippetViewer;
