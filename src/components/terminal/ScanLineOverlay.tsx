/// ScanLineOverlay — CRT-style scan-line effect for the terminal.
///
/// Renders a semi-transparent gradient bar that sweeps from top to bottom,
/// creating a retro CRT monitor appearance. Respects `prefers-reduced-motion`.

import { type Component } from "solid-js";

export interface ScanLineOverlayProps {
  /** Whether the overlay is visible */
  visible: boolean;
}

export const ScanLineOverlay: Component<ScanLineOverlayProps> = (props) => {
  return (
    <div
      class="scanline-overlay"
      classList={{
        "scanline-overlay--visible": props.visible,
        "scanline-overlay--hidden": !props.visible,
      }}
      aria-hidden="true"
      data-testid="scanline-overlay"
    />
  );
};
