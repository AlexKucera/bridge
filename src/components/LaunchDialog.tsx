import { createSignal, createEffect, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

/**
 * Props for the LaunchDialog modal component.
 */
export interface LaunchDialogProps {
  /** Whether the dialog is visible. */
  open: boolean;
  /** ID of the vessel to launch on (null if no vessel selected). */
  vesselId: number | null;
  /** Display name of the vessel (for the dialog title). */
  vesselName: string;
  /** Callback when the dialog is dismissed. */
  onClose: () => void;
  /** Callback invoked with the new session ID after successful launch. */
  onLaunched?: (sessionId: number, mode: string) => void;
}

/** Raw session object returned by Rust `session_launch` command. */
export interface LaunchedSession {
  id: number;
  vesselId: number;
  mode: string;
  model: string;
  prompt: string;
  provider: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  tokensUsed: number;
  totalCost: number;
}

/**
 * Modal dialog for launching a new Pi session on a vessel.
 *
 * Renders prompt input, mode toggle (Structured JSON / Terminal PTY),
 * quick template chips, live config summary, CLI preview, pre-flight
 * validation warning, and launch button. Shows session result card
 * after successful launch.
 */
export function LaunchDialog(props: LaunchDialogProps) {
  const [prompt, setPrompt] = createSignal("");
  const [mode, setMode] = createSignal<"json" | "pty">("json");
  const [launching, setLaunching] = createSignal(false);
  const [result, setResult] = createSignal<{ sessionId: number } | null>(null);
  const [preflightOk, setPreflightOk] = createSignal(true);
  const [preflightWarning, setPreflightWarning] = createSignal("");
  const [config, setConfig] = createSignal<any>(null);

  // Fetch live config and run pre-flight when dialog opens
  createEffect(() => {
    if (props.open) {
      setResult(null);
      setPrompt("");
      setLaunching(false);
      // Fetch live config for summary + CLI preview
      invoke("config_get").then((c: any) => setConfig(c)).catch(() => {});
      // Pre-flight validation
      invoke("config_validate").then((v: any) => {
        const ok = v?.overall === "Pass" || v?.overall === "Warn";
        setPreflightOk(ok);
        setPreflightWarning(ok ? "" : (v?.binary || "Pi binary not found or not executable"));
      }).catch(() => { setPreflightOk(false); setPreflightWarning("Validation failed"); });
    }
  });

  const templates = [
    { label: "Code Review", prompt: "Review this codebase for bugs, security issues, and improvements." },
    { label: "Debug", prompt: "Investigate and fix the failing test / bug described in the workspace." },
    { label: "Feature", prompt: "Implement the feature described in the requirements." },
    { label: "Docs", prompt: "Generate comprehensive documentation for this codebase." },
  ];

  const canLaunch = () => prompt().trim().length > 0 && !launching() && preflightOk();

  const handleLaunch = async () => {
    if (!canLaunch()) return;
    setLaunching(true);
    try {
      const session = await invoke<LaunchedSession>("session_launch", {
        vesselId: props.vesselId,
        mode: mode(),
        prompt: prompt().trim(),
        overridesJson: "{}",
      });
      // Rust returns full Session object; extract numeric ID
      const sessionId = typeof session === "object" && session != null ? session.id : Number(session);
      setResult({ sessionId });
      props.onLaunched?.(sessionId, mode());
    } catch (e: any) {
      console.error("Launch failed:", e);
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Show when={props.open} fallback={<div />}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={props.onClose}>
        <div class="bg-[var(--color-surface)] rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
            <h2 class="text-base font-semibold text-[var(--color-text-primary)]">
              Launch on {props.vesselName || "Bridge"}
            </h2>
            <button class="p-1 rounded-md hover:bg-[var(--color-fill-hover)] text-[var(--color-text-secondary)]" onClick={props.onClose}>
              ✕
            </button>
          </div>

          {/* Body */}
          <div class="px-6 py-4 space-y-4">
            {/* Mode Toggle */}
            <div class="flex gap-1 rounded-lg bg-[var(--color-fill-secondary)] p-0.5">
              <button
                class={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode() === "json" ? "bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}
                onClick={() => setMode("json")}
              >Structured JSON</button>
              <button
                class={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode() === "pty" ? "bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"}`}
                onClick={() => setMode("pty")}
              >Terminal PTY</button>
            </div>

            {/* Prompt Input */}
            <div>
              <label class="block text-sm font-medium text-[var(--color-text-secondary)] mb-1.5">Prompt</label>
              <textarea
                class="w-full h-24 px-3 py-2 rounded-lg bg-[var(--color-fill-secondary)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
                placeholder="Describe what you want Pi to do..."
                value={prompt()}
                onInput={(e: any) => setPrompt(e.currentTarget.value)}
              />
            </div>

            {/* Quick Templates */}
            <div>
              <label class="block text-xs font-medium text-[var(--color-text-tertiary)] mb-1.5">Quick Templates</label>
              <div class="flex flex-wrap gap-1.5">
                {templates.map((t) => (
                  <button
                    key={t.label}
                    class="px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
                    onClick={() => setPrompt(t.prompt)}
                  >{t.label}</button>
                ))}
              </div>
            </div>

            {/* Config Summary — LIVE data */}
            <Show when={config()} fallback={
              <div class="text-xs text-[var(--color-text-tertiary)]">Loading config...</div>
            }>
              <div>
                <label class="block text-xs font-medium text-[var(--color-text-tertiary)] mb-1.5">Configuration</label>
                <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">Model</span><span class="text-[var(--color-text-primary)]">{config()?.defaultModel ?? config()?.model ?? "--"} <span class="text-[var(--color-text-tertiary)]">[Global]</span></span></div>
                  <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">Provider</span><span class="text-[var(--color-text-primary)]">{config()?.defaultProvider ?? "--"} <span class="text-[var(--color-text-tertiary)]">[Default]</span></span></div>
                  <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">Thinking</span><span class="text-[var(--color-text-primary)]">{config()?.defaultThinkingLevel ?? "--"} <span class="text-[var(--color-text-tertiary)]">[Default]</span></span></div>
                  <div class="flex justify-between"><span class="text-[var(--color-text-secondary)]">Tool Policy</span><span class="text-[var(--color-text-primary)]">{config()?.toolPolicy ?? "--"}</span></div>
                  <div class="col-span-2 flex justify-between"><span class="text-[var(--color-text-secondary)]">Binary</span><span class="text-[var(--color-text-primary)] font-mono text-[11px]">{config()?.piBinaryPath ?? "(not set)"} <span class="text-[var(--color-text-tertiary)]">[Global]</span></span></div>
                </div>
              </div>
            </Show>

            {/* CLI Preview — LIVE */}
            <Show when={config()} fallback={<div />}>
              <div>
                <label class="block text-xs font-medium text-[var(--color-text-tertiary)] mb-1">CLI Preview</label>
                <code class="block px-3 py-2 rounded-md bg-[var(--color-bg-canvas)] border border-[var(--color-border)] text-[11px] font-mono text-[var(--color-text-secondary)] whitespace-pre-wrap break-all">
{config()?.piBinaryPath || "pi"} {mode() === "json" ? "chat" : ""} --output-format json{mode() === "json" && config()?.defaultModel ? " --model " + config().defaultModel : ""}
                </code>
              </div>
            </Show>

            {/* Pre-flight Warning */}
            <Show when={!preflightOk() && props.open}>
              <div class="flex items-start gap-2 px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <span class="text-yellow-500 text-sm mt-0.5">!</span>
                <div class="text-xs text-yellow-600 dark:text-yellow-400">
                  <strong>Preflight Check Failed:</strong> {preflightWarning()}
                </div>
              </div>
            </Show>
          </div>

          {/* Footer */}
          <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)]">
            <button class="px-4 py-2 rounded-lg text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-fill-secondary)] transition-colors" onClick={props.onClose}>Cancel</button>
            <button
              class={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${canLaunch() ? "bg-[var(--color-accent)] text-white hover:brightness-110 cursor-pointer" : "bg-[var(--color-fill-secondary)] text-[var(--color-text-disabled)] cursor-not-allowed"}`}
              disabled={!canLaunch()}
              onClick={handleLaunch}
            >
              {launching() ? "Launching..." : "Launch Session"}
            </button>
          </div>

          {/* Session Result Card */}
          <Show when={result()}>
            <div class="mx-6 mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <div class="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                Session #{result()?.sessionId} launched successfully
              </div>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
