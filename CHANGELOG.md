All notable changes to this project will be documented in this file. The format is based on [Common Changelog](https://common-changelog.org) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### feat
- **scaffold:** initialize Tauri v2 + SolidJS + Vite project with Rust crate dependencies (tokio, serde, sqlx, portable-pty)
- **design-system:** port complete 30-section CSS design system (1959 lines) from prototype with oklch color tokens, theme/accent/density switchers, and reduced-motion support
- **hooks:** add useTheme(), useAccent(), useDensity() SolidJS hooks with localStorage persistence and data-* attribute flipping
- **tokens:** add TypeScript constants mirroring all CSS custom property values
- **testing:** add 203 Vitest assertions across 7 test files covering scaffold, tokens, base styles, theme switching, component primitives, hooks, and launch readiness
- **chrome:** add app shell (titlebar + content + bottom nav) via ChromeLayout with 32px/1fr/48px CSS grid and theme data-attributes
- **nav:** extract BottomNavBar as pure presentational component with 5 sections (Fleet, Charts, Log, Helm, Welcome), glow underline active state, and digit 1–5 keyboard shortcuts
- **router:** wire @solidjs/router mapping 6 routes to screen components with ChromeLayout as shared root layout; fix redirect→Navigate import
- **screens:** implement WelcomeScreen (hero, tagline, meta badges, 4 navigation preview cards) and 5 overlay screen stubs using OverlayLayout sidebar+content shell
- **overlay:** add OverlayLayout component for consistent 240px nav-sidebar + fluid content layout across Helm/Log/Charts screens
- **testing:** add 54 Vitest assertions across 6 test files covering navbar, keyboard shortcuts, welcome cards, overlay layout, responsive structure, and route mapping (257 total)
