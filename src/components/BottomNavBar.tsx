/* BottomNavBar — presentational navigation bar
   Renders 5 navigation items with icons, labels, active state,
   and optional keyboard shortcuts (digits 1-5).
   Pure component: receives active path as prop, no router dependency.
   ChromeLayout wires it to the real router. */

import { createEffect, onCleanup } from "solid-js";
import type { JSX } from "solid-js";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/fleet", label: "Fleet", icon: "⚓" },
  { href: "/charts", label: "Charts", icon: "📊" },
  { href: "/log", label: "Log", icon: "📜" },
  { href: "/helm", label: "Helm", icon: "🧭" },
  { href: "/welcome", label: "Welcome", icon: "🏠" },
] as const;

/** Check if a nav item matches the current location */
export function isActiveNav(path: string, current: string): boolean {
  if (path === "/welcome") return current === "/welcome" || current === "/";
  return current.startsWith(path);
}

interface BottomNavBarProps {
  /** Current URL pathname for active-state detection */
  currentPath: string;
  /** Called when a nav item is activated (click or keyboard) */
  onNavigate?: (href: string) => void;
  /** Enable keyboard shortcuts (digits 1-5). Default: true */
  keyboardShortcuts?: boolean;
}

export function BottomNavBar(props: BottomNavBarProps) {
  const enabled = props.keyboardShortcuts !== false;

  // Keyboard shortcut handler: digits 1-5 activate nav sections
  function handleKeydown(e: KeyboardEvent) {
    if (!enabled) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const num = parseInt(e.key, 10);
    if (num >= 1 && num <= 5 && NAV_ITEMS[num - 1]) {
      if (props.onNavigate) {
        props.onNavigate(NAV_ITEMS[num - 1].href);
      } else {
        window.location.href = NAV_ITEMS[num - 1].href;
      }
    }
  }

  createEffect(() => {
    window.addEventListener("keydown", handleKeydown);
    onCleanup(() => window.removeEventListener("keydown", handleKeydown));
  });

  return (
    <nav class="bottomnav" aria-label="Main navigation">
      <div class="bottomnav__group">
        {NAV_ITEMS.map((item) => (
          <a
            href={item.href}
            class="navbtn"
            aria-current={isActiveNav(item.href, props.currentPath) ? "page" : undefined}
            data-nav={item.label.toLowerCase()}
            onClick={(e) => {
              if (props.onNavigate) {
                e.preventDefault();
                props.onNavigate(item.href);
              }
            }}
          >
            <span class="ico">{item.icon}</span>
            <span class="lbl">{item.label}</span>
          </a>
        ))}
      </div>
      <div class="navmeta">
        <span class="dot" />
        <span>All systems nominal</span>
      </div>
    </nav>
  );
}
