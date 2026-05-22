/* App.tsx — Bridge app shell
   Renders the chrome layout: titlebar + main content area + bottom nav.
   This is the root component that Tauri launches. */

import { useTheme, useAccent, useDensity } from "./lib/theme";

export function App() {
  // Initialize theme hooks (apply attributes to <html> on mount)
  const { theme: themeSig } = useTheme();
  const { accent } = useAccent();
  const { density } = useDensity();

  return (
    <div class="app" data-theme={themeSig()} data-accent={accent()} data-density={density()}>
      {/* Title bar */}
      <header class="titlebar">
        <div class="tb-left">
          {/* Left-side titlebar controls */}
        </div>
        <div class="tb-title">
          Bridge <b>Mission Control</b>
        </div>
        <div class="tb-right">
          <span class="tb-pill">v0.1</span>
        </div>
      </header>

      {/* Main content area — vessels, execution view, etc. will render here */}
      <main class="app__main" />

      {/* Bottom navigation */}
      <nav class="bottomnav">
        <div class="bottomnav__group">
          <button class="navbtn" aria-current="page">
            <span class="ico">⚓</span>
            <span class="lbl">Fleet</span>
          </button>
          <button class="navbtn">
            <span class="ico">🚀</span>
            <span class="lbl">Crew</span>
          </button>
          <button class="navbtn">
            <span class="ico">📦</span>
            <span class="lbl">Cargo</span>
          </button>
        </div>
        <div class="navmeta">
          <span class="dot" />
          <span>All systems nominal</span>
        </div>
      </nav>
    </div>
  );
}
