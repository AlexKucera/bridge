import { For } from "solid-js";
import type { Component } from "solid-js";
import type { DiffSummary } from "../../lib/cargo-types";

interface Props {
  summary: DiffSummary;
}

const SummaryStatsBar: Component<Props> = (props) => {
  return (
    <div class="cargo-summary-bar" data-testid="cargo-summary">
      <div class="cargo-stat cargo-stat-added" data-testid="cargo-stat-added">
        <span class="cargo-stat-icon">+</span>
        <span class="cargo-stat-count">{props.summary.added}</span>
      </div>
      <div class="cargo-stat cargo-stat-modified" data-testid="cargo-stat-modified">
        <span class="cargo-stat-icon">~</span>
        <span class="cargo-stat-count">{props.summary.modified}</span>
      </div>
      <div class="cargo-stat cargo-stat-deleted" data-testid="cargo-stat-deleted">
        <span class="cargo-stat-icon">−</span>
        <span class="cargo-stat-count">{props.summary.deleted}</span>
      </div>
    </div>
  );
};

export default SummaryStatsBar;
