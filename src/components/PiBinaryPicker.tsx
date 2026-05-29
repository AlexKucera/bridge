/* PiBinaryPicker — text input with Auto-detect button
   Calls Tauri config_detect_binary command to search PATH + common locations. */

import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

interface PiBinaryPickerProps {
  value: string;
  onChange: (path: string) => void;
}

export function PiBinaryPicker(props: PiBinaryPickerProps) {
  const [detecting, setDetecting] = createSignal(false);
  const [detectError, setDetectError] = createSignal<string | null>(null);

  async function handleAutoDetect() {
    setDetecting(true);
    setDetectError(null);
    try {
      const detected = await invoke<string | null>("config_detect_binary");
      if (detected) {
        props.onChange(detected);
      } else {
        setDetectError("Pi binary not found in PATH or common locations");
      }
    } catch (e) {
      setDetectError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div class="pi-binary-picker">
      <input
        type="text"
        class="pi-binary-picker__input"
        value={props.value}
        placeholder="/usr/local/bin/pi"
        onInput={(e) => props.onChange((e.target as HTMLInputElement).value)}
      />
      <button
        class="pi-binary-picker__detect"
        onClick={handleAutoDetect}
        disabled={detecting()}
        type="button"
        title="Auto-detect Pi binary"
      >
        {detecting() ? "…" : "Auto-detect"}
      </button>
      {detectError() && (
        <span class="pi-binary-picker__error">{detectError()}</span>
      )}
    </div>
  );
}
