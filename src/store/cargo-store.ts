/// Cargo Store — reactive SolidJS store for Cargo Panel state.
///
/// Manages git status, diff, commit, and push operations
/// by calling Tauri commands on the Rust backend.

import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import type {
  CargoPanelState,
  StatusResult,
  DiffResult,
  SessionContext,
} from "../lib/cargo-types";

// ── Store Interface ─────────────────────────────────────

export interface CargoStore {
  // Signals (readers)
  vesselPath: () => string | null;
  status: () => StatusResult | null;
  diff: () => DiffResult | null;
  selectedFilePath: () => string | null;
  commitMessage: () => string;
  isCommitting: () => boolean;
  error: () => string | null;
  successMessage: () => string | null;

  // Actions
  fetchStatus: (path: string) => Promise<void>;
  fetchDiff: (path: string) => Promise<void>;
  selectFile: (path: string | null) => void;
  setCommitMessage: (msg: string) => void;
  setSail: (path: string) => Promise<void>;
  generateMessage: (ctx: SessionContext) => Promise<void>;
  refresh: (path: string) => Promise<void>;
  clearError: () => void;
  setVesselPath: (path: string) => void;
  clearSuccess: () => void;
}

// ── Factory ────────────────────────────────────────────

export function createCargoStore(): CargoStore {
  const [vesselPath, setVesselPath] = createSignal<string | null>(null);
  const [status, setStatus] = createSignal<StatusResult | null>(null);
  const [diff, setDiff] = createSignal<DiffResult | null>(null);
  const [selectedFilePath, setSelectedFilePath] = createSignal<string | null>(null);
  const [commitMessage, setCommitMessage] = createSignal<string>("");
  const [isCommitting, setIsCommitting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [successMessage, setSuccessMessage] = createSignal<string | null>(null);

  async function doFetchStatus(path: string) {
    try {
      setVesselPath(path);
      setError(null);
      const result = await invoke<StatusResult>("cargo_status", { vesselPath: path });
      setStatus(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus(null);
    }
  }

  async function doFetchDiff(path: string) {
    try {
      setVesselPath(path);
      setError(null);
      const result = await invoke<DiffResult>("cargo_diff", { vesselPath: path });
      setDiff(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setDiff(null);
    }
  }

  return {
    vesselPath,
    status,
    diff,
    selectedFilePath,
    commitMessage,
    isCommitting,
    error,
    successMessage,

    fetchStatus: doFetchStatus,
    fetchDiff: doFetchDiff,

    selectFile(path: string | null) {
      setSelectedFilePath(path);
    },

    setCommitMessage(msg: string) {
      setCommitMessage(msg);
    },

    async setSail(path: string) {
      setIsCommitting(true);
      setError(null);
      setSuccessMessage(null);

      try {
        // Step 1: Commit
        const commitResult = await invoke<{ hash: string; timestamp: string }>(
          "cargo_commit",
          { vesselPath: path, message: commitMessage() }
        );

        // Step 2: Push
        const pushResult = await invoke<{ success: boolean; message: string }>(
          "cargo_push",
          { vesselPath: path }
        );

        if (pushResult.success) {
          setSuccessMessage(
            `Anchored! Committed ${commitResult.hash.slice(0, 7)} and pushed to origin`
          );
          // Refresh status/diff after successful push
          await refresh(path);
        } else {
          setError(pushResult.message || "Push failed");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setIsCommitting(false);
      }
    },

    async generateMessage(ctx: SessionContext) {
      try {
        const msg = await invoke<string>("cargo_generate_message", { context: ctx });
        setCommitMessage(msg);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Failed to generate message: ${msg}`);
      }
    },

    async refresh(path: string) {
      setVesselPath(path);
      setError(null);
      await Promise.all([doFetchStatus(path), doFetchDiff(path)]);
    },

    clearError() {
      setError(null);
    },

    setVesselPath(path: string) {
      setVesselPath(path);
    },

    clearSuccess() {
      setSuccessMessage(null);
    },
  };
}
