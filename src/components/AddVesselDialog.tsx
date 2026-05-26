/* AddVesselDialog — Modal for adding a new vessel to the fleet

   Provides:
   - Path text input with native directory picker (Browse button)
   - Display name field (auto-filled from directory name)
   - Validation feedback for path errors
   - Confirm / Cancel actions */

import { createSignal, createEffect } from "solid-js";

export interface AddVesselDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit?: (path: string, displayName: string) => void;
  error?: string;
}

export function AddVesselDialog(props: AddVesselDialogProps) {
  const [path, setPath] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");

  // Auto-fill display name from path (directory name)
  createEffect(() => {
    const p = path();
    if (p && !displayName()) {
      const name = p.split("/").filter(Boolean).pop() || p.split("\\").pop() || "";
      setDisplayName(name);
    }
  });

  async function handleBrowse() {
    try {
      // Invoke Tauri's native directory picker
      const selected = await (window as any).__TAURI__.dialog.open({
        directory: true,
        multiple: false,
      });
      if (selected) {
        setPath(typeof selected === "string" ? selected : selected[0]);
      }
    } catch {
      // Tauri API not available in test/browser mode
      console.warn("Native dialog not available");
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault();
    props.onSubmit?.(path(), displayName());
  }

  return (
    <div
      class="dialog-overlay"
      style={{
        display: props.open ? "flex" : "none",
        position: "fixed",
        inset: "0",
        "z-index": "100",
        "align-items": "center",
        "justify-content": "center",
        background: "rgba(0, 0, 0, 0.5)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Add Vessel"
    >
      <div
        class="dialog-card"
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border)",
          "border-radius": "8px",
          padding: "24px",
          width: "440px",
          "max-width": "90vw",
          "box-shadow": "0 8px 32px rgba(0, 0, 0, 0.3)",
        }}
      >
        <h2 style={{ margin: "0 0 16px", "font-size": "18px" }}>Add Vessel</h2>

        {props.error && (
          <div style={{
            padding: "8px 12px",
            background: "var(--color-danger)",
            color: "#fff",
            "border-radius": "4px",
            "font-size": "13px",
            "margin-bottom": "12px",
          }}>
            {props.error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Path input */}
          <label style={{ display: "block", "margin-bottom": "8px", "font-size": "13px", "font-weight": "500" }}>
            Repository Path
            <div style={{ display: "flex", gap: "6px", "margin-top": "4px" }}>
              <input
                type="text"
                placeholder="/path/to/git/repo"
                value={path()}
                onInput={(e) => { setPath((e.target as HTMLInputElement).value); }}
                style={{
                  flex: 1,
                  padding: "7px 10px",
                  border: "1px solid var(--border)",
                  "border-radius": "4px",
                  background: "var(--bg-secondary)",
                  color: "var(--text)",
                  "font-size": "13px",
                }}
                aria-label="Repository path"
              />
              <button
                type="button"
                onClick={handleBrowse}
                style={{
                  padding: "7px 14px",
                  border: "1px solid var(--border)",
                  "border-radius": "4px",
                  background: "var(--bg-tertiary)",
                  color: "var(--text)",
                  cursor: "pointer",
                  "font-size": "13px",
                }}
              >
                Browse…
              </button>
            </div>
          </label>

          {/* Display name */}
          <label style={{ display: "block", margin: "12px 0 8px", "font-size": "13px", "font-weight": "500" }}>
            Display Name
            <input
              type="text"
              placeholder="Auto-filled from directory name"
              value={displayName()}
              onInput={(e) => { setDisplayName((e.target as HTMLInputElement).value); }}
              style={{
                width: "100%",
                padding: "7px 10px",
                "margin-top": "4px",
                border: "1px solid var(--border)",
                "border-radius": "4px",
                background: "var(--bg-secondary)",
                color: "var(--text)",
                "font-size": "13px",
                "box-sizing": "border-box",
              }}
              aria-label="Display name"
            />
          </label>

          {/* Buttons */}
          <div style={{ display: "flex", "justify-content": "flex-end", gap: "8px", "margin-top": "20px" }}>
            <button
              type="button"
              onClick={props.onClose}
              style={{
                padding: "7px 16px",
                border: "1px solid var(--border)",
                "border-radius": "4px",
                background: "transparent",
                color: "var(--text)",
                cursor: "pointer",
                "font-size": "13px",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "7px 16px",
                border: "1px solid var(--color-primary)",
                "border-radius": "4px",
                background: "var(--color-primary)",
                color: "#fff",
                cursor: "pointer",
                "font-size": "13px",
                "font-weight": "500",
              }}
            >
              Add Vessel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
