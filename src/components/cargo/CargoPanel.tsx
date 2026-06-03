import { Show, createMemo } from "solid-js";
import type { Component } from "solid-js";
import SummaryStatsBar from "./SummaryStatsBar";
import FileDiffList from "./FileDiffList";
import DiffSnippetViewer from "./DiffSnippetViewer";
import CommitMessageEditor from "./CommitMessageEditor";
import ConflictWarningBanner from "./ConflictWarningBanner";
import SetSailButton from "./SetSailButton";
import type { CargoStore } from "../../store/cargo-store";

interface Props {
  store: CargoStore;
}

const CargoPanel: Component<Props> = (props) => {
  const hasConflicts = () =>
    props.store.status()?.hasConflicts ||
    props.store.status()?.mergeInProgress;

  const selectedFileDiff = createMemo(() => {
    const selected = props.store.selectedFilePath();
    if (!selected || !props.store.diff()) return null;
    return props.store.diff()!.files.find((f) => f.path === selected) ?? null;
  });

  const canSetSail = () => {
    if (!props.store.commitMessage().trim()) return false;
    if (hasConflicts()) return false;
    if (props.store.isCommitting()) return false;
    if (props.store.status()?.isClean) return false;
    return true;
  };

  return (
    <div class="cargo-panel" data-testid="cargo-panel">
      {/* Error / Success toasts */}
      <Show when={props.store.error()}>
        {(err) => (
          <div class="cargo-toast cargo-toast-error" data-testid="cargo-error">
            {err()}
          </div>
        )}
      </Show>
      <Show when={props.store.successMessage()}>
        {(msg) => (
          <div class="cargo-toast cargo-toast-success" data-testid="cargo-success">
            {msg()}
          </div>
        )}
      </Show>

      {/* Conflict warning */}
      <ConflictWarningBanner
        hasConflicts={props.store.status()?.hasConflicts ?? false}
        mergeInProgress={props.store.status()?.mergeInProgress ?? false}
      />

      {/* Summary stats */}
      <Show when={props.store.diff()}>
        {(diff) => <SummaryStatsBar summary={diff().summary} />}
      </Show>

      {/* Branch name */}
      <Show when={props.store.status()?.branchName}>
        {(branch) => (
          <div class="cargo-branch" data-testid="cargo-branch">
            <span class="cargo-branch-label">branch:</span> {branch()}
          </div>
        )}
      </Show>

      {/* Main content: file list + diff viewer */}
      <div class="cargo-main" data-testid="cargo-main">
        <div class="cargo-file-list-container">
          <FileDiffList
            files={props.store.diff()?.files ?? props.store.status()?.files ?? []}
            selectedPath={props.store.selectedFilePath()}
            onSelect={(path) => props.store.selectFile(path)}
          />
        </div>
        <div class="cargo-diff-container">
          <DiffSnippetViewer fileDiff={selectedFileDiff()} />
        </div>
      </div>

      {/* Commit editor + Set Sail */}
      <div class="cargo-actions" data-testid="cargo-actions">
        <CommitMessageEditor
          value={props.store.commitMessage()}
          onInput={(v) => props.store.setCommitMessage(v)}
          disabled={props.store.isCommitting() || hasConflicts()}
        />
        <SetSailButton
          onClick={() => props.store.setSail(props.store.vesselPath()!)}
          isCommitting={props.store.isCommitting()}
          disabled={!canSetSail()}
        />
      </div>
    </div>
  );
};

export default CargoPanel;
