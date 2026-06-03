/* LogSearch — Search field with ⌘F keyboard shortcut

   Debounced text search across message + vessel_name.
   Shows clear button when has input. */

import { createSignal, onMount, onCleanup } from "solid-js";

interface Props {
  value: () => string | null;
  onSearch: (text: string) => void;
  onClear: () => void;
}

export function LogSearch(props: Props) {
  let inputRef: HTMLInputElement | undefined;
  const [localValue, setLocalValue] = createSignal("");
  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleInput() {
    const val = inputRef?.value ?? "";
    setLocalValue(val);

    // Debounce: wait 200ms after typing stops
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      props.onSearch(val || null);
    }, 200);
  }

  function handleClear() {
    if (inputRef) inputRef.value = "";
    setLocalValue("");
    props.onClear();
  }

  // ⌘F focuses search
  function handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "f") {
      e.preventDefault();
      inputRef?.focus();
      inputRef?.select();
    }
  }

  onMount(() => window.addEventListener("keydown", handleKeyDown));
  onCleanup(() => window.removeEventListener("keydown", handleKeyDown));

  return (
    <div class="log-search" data-testid="log-search">
      <span class="log-search-icon">🔍</span>
      <input
        ref={inputRef}
        type="text"
        class="log-search-input"
        placeholder="Search events… (⌘F)"
        value={localValue()}
        onInput={handleInput}
        data-testid="search-input"
      />
      <Show when={localValue().length > 0}>
        <button class="log-search-clear" onClick={handleClear} data-testid="search-clear">
          ✕
        </button>
      </Show>
    </div>
  );
}
