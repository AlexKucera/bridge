/* ChromeLayout — shared app shell wrapper
   Renders titlebar + bottom nav around a route {props.children} outlet.
   Every route passes through this layout so navigation
   and chrome are always visible. */

import { useLocation } from "@solidjs/router";
import { useTheme, useAccent, useDensity } from "../lib/theme";
import { BottomNavBar } from "./BottomNavBar";
import type { RouteSectionProps } from "@solidjs/router";

export function ChromeLayout(props: RouteSectionProps) {
  const { theme: themeSig } = useTheme();
  const { accent } = useAccent();
  const { density } = useDensity();
  const location = useLocation();

  return (
    <div class="app" data-theme={themeSig()} data-accent={accent()} data-density={density()}>
      {/* Title bar */}
      <header class="titlebar">
        <div class="tb-left" />
        <div class="tb-title">
          Bridge <b>Mission Control</b>
        </div>
        <div class="tb-right">
          <span class="tb-pill">v0.1</span>
        </div>
      </header>

      {/* Route outlet — child route renders here */}
      <main class="app__main">{props.children}</main>

      {/* Bottom navigation (includes keyboard shortcuts) */}
      <BottomNavBar currentPath={location.pathname} />
    </div>
  );
}
