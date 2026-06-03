import { For } from "solid-js";
import type { Component } from "solid-js";
import { changeTypeIcon, changeTypeColor } from "../../lib/cargo-types";
import type { FileDiff, StatusFile } from "../../lib/cargo-types";

interface Props {
  files: FileDiff[] | StatusFile[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

const FileDiffList: Component<Props> = (props) => {
  return (
    <div class="cargo-file-list" data-testid="cargo-file-list">
      <For each={props.files}>
        {(file) => {
          const isSelected = () => file.path === props.selectedPath;
          const icon = changeTypeIcon(file.changeType);
          const colorClass = changeTypeColor(file.changeType);
          const additions = "additions" in file ? file.additions : undefined;
          const deletions = "deletions" in file ? file.deletions : undefined;

          return (
            <button
              classList={{
                "cargo-file-entry": true,
                "cargo-file-selected": isSelected(),
                [colorClass]: true,
              }}
              data-testid={`cargo-file-${file.path.replace(/\//g, "-")}`}
              onClick={() => props.onSelect(file.path)}
            >
              <span class="cargo-file-icon">{icon}</span>
              <span class="cargo-file-path">{file.path}</span>
              {(additions !== undefined || deletions !== undefined) && (
                <span class="cargo-file-stats">
                  {additions !== undefined && <span class="cargo-stat-add">+{additions}</span>}
                  {deletions !== undefined && <span class="cargo-stat-del">−{deletions}</span>}
                </span>
              )}
            </button>
          );
        }}
      </For>
    </div>
  );
};

export default FileDiffList;
