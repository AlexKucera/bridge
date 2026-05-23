/* OverlayLayout — sidebar + content shell for Helm & Log screens
   Renders a two-column layout:
   - Left: navigation sidebar (240px)
   - Right: scrollable content area
   Used by HelmScreen and LogScreen. */

import type { JSX } from "solid-js";

export interface NavSection {
  title: string;
  items: Array<{ href: string; label: string; icon?: string }>;
}

interface OverlayLayoutProps {
  /** Page title shown in the header */
  title: string;
  /** Optional subtitle */
  subtitle?: string;
  /** Navigation sections for the sidebar */
  navSections?: readonly NavSection[];
  /** Current active path for sidebar highlighting */
  currentPath?: string;
  /** Main content */
  children: JSX.Element;
}

export function OverlayLayout(props: OverlayLayoutProps) {
  return (
    <div class="overlay">
      {/* Header */}
      <div class="overlay__head">
        <div>
          <h1>{props.title}</h1>
          {props.subtitle && <p>{props.subtitle}</p>}
        </div>
      </div>

      {/* Main: sidebar + content */}
      <div class="overlay__main">
        {/* Sidebar navigation */}
        <nav class="overlay__nav" aria-label="Section navigation">
          {(props.navSections ?? []).map((section) => (
            <div>
              <h3>{section.title}</h3>
              {section.items.map((item) => (
                <a
                  href={item.href}
                  aria-current={
                    props.currentPath === item.href ? "true" : undefined
                  }
                >
                  {item.icon && <span class="ico">{item.icon}</span>}
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>

        {/* Content area */}
        <div class="overlay__content">{props.children}</div>
      </div>
    </div>
  );
}
