/* ValidationStatus — displays per-check Pass/Warn/Fail results */

import { createSignal, onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

interface ValidationCheck {
  name: string;
  status: "Pass" | "Warn" | "Fail";
  message: string;
}

interface ValidationReport {
  checks: ValidationCheck[];
  overall: "Pass" | "Warn" | "Fail";
}

const STATUS_STYLES: Record<string, string> = {
  Pass: "validation-check--pass",
  Warn: "validation-check--warn",
  Fail: "validation-check--fail",
};

const OVERALL_STYLES: Record<string, string> = {
  Pass: "validation-overall--pass",
  Warn: "validation-overall--warn",
  Fail: "validation-overall--fail",
};

export function ValidationStatus() {
  const [report, setReport] = createSignal<ValidationReport | null>(null);
  const [loading, setLoading] = createSignal(false);

  async function validate() {
    setLoading(true);
    try {
      const result = await invoke<ValidationReport>("config_validate");
      setReport(result);
    } catch (e) {
      console.error("Validation failed:", e);
    } finally {
      setLoading(false);
    }
  }

  onMount(() => {
    validate();
  });

  return (
    <div class="validation-status">
      <div class="validation-status__header">
        <span class="validation-status__title">Configuration Health</span>
        {report() && (
          <span class={`validation-overall ${OVERALL_STYLES[report().overall]}`}>
            {report().overall}
          </span>
        )}
        <button
          class="validation-status__refresh"
          onClick={validate}
          disabled={loading()}
          type="button"
          title="Re-validate"
        >
          {loading() ? "…" : "↻"}
        </button>
      </div>

      {!report() && !loading() && (
        <p class="validation-status__empty">Click refresh to validate configuration</p>
      )}

      {report() && (
        <ul class="validation-checks">
          {report().checks.map((check) => (
            <li class={`validation-check ${STATUS_STYLES[check.status] || ""}`}>
              <span class="validation-check__status">{check.status}</span>
              <span class="validation-check__name">{check.name}</span>
              <span class="validation-check__message">{check.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
