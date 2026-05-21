# Product

## Register

product

## Users

Developers deep in AI-assisted work sessions across multiple git repositories. They live in the terminal and their editor. Bridge sits alongside them as a persistent command center: launching Pi agents on vessels (repos), watching execution stream in real time, reviewing cargo (diffs), and shipping with one click. They want density, speed, and minimal chrome. Every pixel should earn its place. They are not browsing; they are commanding.

## Product Purpose

Bridge is a Tauri v2 + SolidJS desktop application that serves as mission control for Pi-powered AI-assisted software development across multiple git projects. It replaces "open 15 tabs, run pi in each, lose track of what's where" with a single coordinated surface: fleet sidebar, per-vessel agent panels, streaming execution view, git diff review, and commit+push workflow. Success looks like a developer who never loses context across their fleet of AI-assisted repos.

## Brand Personality

Bold, technical, playful. The nautical metaphor is leaned into with conviction: you're the captain, these are your vessels, that's your crew, and the cargo ships when you say so. But it's never cute or gimmicky; it's the personality of a precision instrument that happens to have character. Think: oscilloscope meets ship's bridge. JetBrains Mono isn't just a font choice; it's the native tongue. The interface should feel like specialized equipment, not a repackaged SaaS template.

## Anti-references

- **Generic SaaS dashboard:** no pastel card grids, no hero-metric templates (big number + small label + gradient accent), no soft-rounded-everything aesthetic borrowed from Linear/Notion/Vercel. Bridge has edges.
- **Gamer / sci-fi HUD excess:** no RGB lighting, no excessive bloom glow, no holographic overlays, no cluttered radar screens with meaningless data rings. It's a professional tool, not a game interface.
- **Bland utilitarianism:** no flat gray tool windows, no Windows-98-era tab panels, no "it's just a shell" resignation. Character and craft matter equally.
- **AI slop signatures:** no gradient text (`background-clip: text`), no glassmorphism as default, no side-stripe borders as visual crutches, no identical card grids repeated endlessly.

## Design Principles

1. **Density over decoration.** A focused developer wants more information, not more padding. Every panel earns its space by showing something useful. Whitespace is rhythm, not absence.
2. **Character through constraint.** The nautical metaphor gives identity; discipline keeps it from becoming a theme park. Every metaphorical term maps to a real function. Playfulness comes from details (the scan-line on terminal, the pulse on status dots), not from spectacle.
3. **Motion means something is happening.** Animations signal state changes: an agent started thinking, a diff appeared, a ship sailed. Never decorative. Ease-out curves, exponential timing. No bounce.
4. **The prototype is foundation, not ceiling.** The HTML prototype established the palette (Monokai Pro-inspired dark), the accent (cyan `#78DDE8`), the type pairing (JetBrains Mono + Inter), and the panel architecture. Subsequent work should deepen this system, not flatten it into generic patterns.
5. **Trustworthy craft.** This tool handles your code. Errors are clear, states are unambiguous, destructive actions have friction. The UI should feel like it was built by someone who respects the user's work.

## Accessibility & Inclusion

- Target: WCAG 2.1 AA as baseline for the desktop app surface
- Dark theme is primary (matches use case: developer in a dim room, long sessions). Ensure all text meets 4.5:1 contrast ratio against dark backgrounds, including muted/dim text variants
- Color is never the only indicator: status is conveyed through icon + label + color, not color alone. Essential for the multi-color semantic system (green running, amber warning, red error, cyan active)
- Reduced motion: all animations should respect `prefers-reduced-motion`. The ambient drift, pulse-glow, badge-pulse, and scanner-rotate animations degrade gracefully to static states
- Keyboard navigation: full keyboard operability expected for a desktop app. Panel switching, vessel selection, action buttons, and the Set Sail action must all be reachable without a mouse
- Font sizes in the prototype go down to 8.5px (labels). These must remain legible or be bumped; micro-text is acceptable for supplemental labels only, never for primary content
