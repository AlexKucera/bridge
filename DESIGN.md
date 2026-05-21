# Design

## Theme

**Dark primary.** A developer at a desk in a dim room, three monitors glowing, 2am or 2pm, doesn't matter because the blinds are down. The interface should feel like looking through a submarine viewport into controlled darkness: everything visible is there because it matters. Light mode exists as a secondary toggle for daytime/bright-room use cases, but dark is the identity.

## Color Palette

### Strategy: Full Palette

3-4 named color roles, each used deliberately. Bridge is data-dense: color encodes state (running/idle/error/warning), distinguishes vessels and agents, and guides attention across panels. This isn't restrained-minimal; it's a command center where color is information.

### OKLCH Tokens

```
── Backgrounds ──
abyss      oklch(0.14 0.015 250)     /* Deepest surface. Title bar, deck, overlays. */
deep       oklch(0.17 0.018 250)     /* Panel backgrounds, cards, inputs, elevated surfaces. */
mid        oklch(0.21 0.020 250)     /* Borders, dividers, subtle fills. Hover states on deep. */
surface    oklch(0.26 0.022 250)     /* Raised elements, active item backgrounds. */
panel      oklch(0.16 0.016 250)     /* Default panel fill. Slightly warmer than abyss. */

── Accent ──
glow       oklch(0.82 0.15 195)      /* Primary accent. Cyan-leaning. Active states, selections,
                                         primary actions, links. The "you are here" color. */
glow-dim   oklch(0.82 0.05 195)      /* Accent at low chroma. Subtle highlights, hover glows,
                                         border tints on interactive elements. */
glow-strong oklch(0.82 0.22 195)     /* Accent at high chroma. Set Sail button, critical CTAs,
                                         moments that demand attention. */

── Text ──
foam       oklch(0.98 0.005 250)     /* Primary text. Warm-tinted white, never pure #fff. */
muted      oklch(0.72 0.010 250)     /* Secondary text. Labels, descriptions, metadata. */
dim        oklch(0.50 0.012 250)     /* Tertiary text. Timestamps, placeholders, faint labels. */
faint      oklch(0.35 0.010 250)     /* Disabled text, borders, decorative elements. */

── Semantic ──
sea-green  oklch(0.78 0.16 155)      /* Success, running, healthy, added diffs, ship actions. */
brass      oklch(0.85 0.18 75)       /* Warning, engine room, build actions, attention-needed. */
alert-red  oklch(0.65 0.22 25)       /* Error, stopped, deleted diffs, destructive actions. */
cargo-blue oklch(0.72 0.14 230)      /* Information, modified diffs, cargo/changes, agent-neutral. */
crew-purple oklch(0.68 0.18 300)     /* Agent identity (Pi sessions), crew members, AI-related. */
radar-green oklch(0.82 0.14 155)     /* Health indicators, pulse dots, "all clear" status.
                                         Slightly lighter/more saturated than sea-green. */
```

### Color Usage Rules

- **Glow (`#78DDE8` area)** is the primary identity carrier. It means "active," "selected," "primary." Used on the active vessel left-border, tab underlines, the Set Sail button gradient, search focus rings.
- **Semantic colors map to state**, never to decoration. Red always means error/stopped/deleted. Green always means success/running/added. Amber always means warning/build/in-progress.
- **Backgrounds progress from abyss (deepest) to surface (most raised).** Never skip a step: content sits on `deep`, elevated cards on `surface`, the chrome around everything on `abyss` or `panel`.
- **No pure black (`#000`) or pure white (`#fff`).** Every neutral is tinted toward the hue axis (~250, slightly cyan-warm). Chroma stays at 0.005-0.022 for neutrals; only accents and semantics carry real chroma.

## Typography

### Strategy: Sans-primary, mono-reserved

Sans-serif carries the interface: headings, body text, labels, navigation, buttons. Monospace is reserved for what is literally code: file paths, branch names, git stats, terminal output, session metadata, timestamps, keyboard shortcuts. This split signals "here is the UI" vs "here is your work."

### Font Stack

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
```

### Type Scale

| Token       | Size    | Weight | Line Height | Letter Spacing | Usage                        |
|-------------|---------|--------|-------------|----------------|------------------------------|
| display     | 22px    | 800    | 1.2         | -0.3px         | Overlay titles (Helm, Log)   |
| h1          | 16px    | 700    | 1.3         | 0.3px          | Vessel name, panel headers   |
| h2          | 14px    | 700    | 1.35        | 0.2px          | Section headings             |
| body        | 13px    | 400    | 1.55        | 0              | Content, descriptions        |
| body-sm     | 12px    | 500    | 1.5         | 0              | Crew names, file paths       |
| caption     | 11.5px  | 600    | 1.4         | 0              | UI labels, nav items         |
| label       | 10px    | 700    | 1.35        | 0.8px          | Uppercase panel titles       |
| micro       | 9.5px   | 700    | 1.3         | 1.2px          | Stat labels, badges, tags    |
| tiny        | 8.5px   | 600    | 1.25        | 1.0px          | Supplemental only: stat sub-labels |

**Scale ratio between steps:** ~1.14 minimum, often larger (display to h1 is 1.37x). No flat scales; each step is visually distinct.

**Line length cap:** Body text never exceeds 65-75ch. Panels naturally constrain this; watch for overflow in wide cargo/diff views.

## Elevation

Bridge uses layered depth rather than flat planes. Each layer has a distinct treatment.

| Level   | Background     | Border                          | Shadow                                    | Usage                     |
|---------|----------------|---------------------------------|-------------------------------------------|---------------------------|
| base    | `panel` / `abyss` | `mid` at 1px, 8% opacity       | none                                      | Root surfaces, sidebars   |
| raised  | `deep`         | `mid` at 1px, 12% opacity       | `0 2px 12px rgba(0,0,0,0.25)`            | Cards, inputs, dropdowns  |
| floating| `deep`         | `glow-dim` at 1px, 15% opacity  | `0 8px 32px rgba(0,0,0,0.35)`            | Modals, tooltips, popovers|
| overlay | `abyss`        | `mid` at 1px, full opacity       | none (full-bleed)                         | Full-screen views (Log)   |

**Glow shadows** replace standard box-shadows for interactive/accent elements:
- `glow-sm`: `0 0 12px glow-dim`
- `glow-md`: `0 0 24px glow-dim-strong`
- Used on: active tabs, focused inputs, hover states on primary actions, status pulses

## Spacing

Spacing uses an 8px base with a 4px half-step for tighter groupings. Rhythm comes from variation, not uniformity.

```
Token     Value   Usage
───       ─────   ───────────────────────────────
xs        4px     Icon-label gap, intra-badge padding
sm        6px     Tight list item padding, button inner gap
md        8px     Standard gap between related elements
lg        12px    Section padding within panels
xl        16px    Panel header padding, section gaps
2xl       24px    Overlay body padding, major section breaks
3xl       32px    Overlay header padding, page-level margins
```

**Rhythm rule:** Adjacent sections should use different spacing values. If a panel header has 16px padding and the first content group also has 16px margin, change one. Monotony = undifferentiated content.

## Border Radius

| Token   | Value | Usage                              |
|---------|-------|-------------------------------------|
| sm      | 5px   | Small buttons, toggles, badges      |
| md      | 10px  | Cards, inputs, panels (default)     |
| lg      | 14px  | Large cards, modals, overlay panels |
| xl      | 18px  | Hero elements, special containers   |

Bridge has edges. Nothing exceeds `xl` (18px). No fully rounded (pill) shapes except for status badges and toggle tracks, where the metaphor is explicitly "indicator" not "container."

## Motion

### Philosophy: Pulse, don't dance

The interface feels alive: status indicators breathe, hover states respond with weight, transitions signal state changes. But motion never competes for attention with the work. A developer in a deep session should never be pulled out of flow by an animation.

### Timing

| Token       | Duration | Easing                     | Usage                            |
|-------------|----------|----------------------------|----------------------------------|
| fast        | 180ms    | cubic-bezier(.4, 0, .2, 1) | Button hover, toggle flip, focus  |
| smooth      | 300ms    | cubic-bezier(.4, 0, .2, 1) | Panel expand, card hover, tab switch |
| spring      | 500ms    | cubic-bezier(.175, .885, .32, 1.275) | Icon scale, playful micro-interactions |
| slow        | 600ms    | ease-out-quart              | Overlay enter/leave, page transitions |

### Animated Elements

| Element           | Trigger    | Property               | Timing  | Notes                              |
|-------------------|------------|------------------------|---------|-------------------------------------|
| Status dot pulse  | Running    | box-shadow opacity     | 2.5s    | Gentle breathe, not strobe          |
| Vessel card hover | Mouse enter| transform translateX   | smooth  | Subtle shift (2px), not slide      |
| Tab indicator     | Active tab| width + opacity        | fast    | Glow spread on underline            |
| Overlay enter     | View open  | transform + opacity    | slow    | Fade up from below                  |
| Scan line         | Terminal   | background-position    | 3s linear | Subtle terminal character, degrades gracefully |
| Ambient drift     | Body bg    | transform translate    | 30s     | Barely perceptible. First thing to cut if perf matters |

### Rules

- **Never animate layout properties** (width, height, top, left, margin, padding). Animate transforms and opacity only.
- **Ease-out exclusively.** No bounce, no elastic, no back-easing (except the `spring` token for intentional playful moments like icon scales).
- **`prefers-reduced-motion` reduces all animations to opacity toggles or removes them entirely.** The ambient drift and scan line become static. Pulses hold steady.

## Components

### Panel

The fundamental container. Every major region (Fleet, Vessel, Cargo, Feed) is a panel. Consistent structure: `.panel > .panel-header + .panel-body`. Header has uppercase title (label size, tracking) plus action buttons. Body scrolls independently.

### Vessel Card

The primary list item in the Fleet sidebar. Shows: icon, name, status badge (pill, mono, uppercase), meta row (branch, diff count, health dot). Active state: left border glow (3px, `glow` color), background tint, subtle glow shadow. Hover: translateX(2px), border brighten.

### Tabs

Underline style (not pill/tab shape). Active tab has a 2px glow underline with box-shadow glow. Tab text is caption-size, semibold, uppercase-tracking on inactive, `glow` color on active. Badges sit inline as small rounded tokens.

### Terminal (Comms Deck)

Monospace font, `deep` background with slight gradient, inset shadow for depth. Colorized output using semantic tokens (green for prompt, red for error, amber for warning, cyan for info). Optional scan-line overlay for character (degrades to nothing).

### Button

Three tiers:
1. **Primary (Set Sail):** Gradient from `glow` to `glow-strong`, dark text, glow shadow, shimmer on hover. Rounded `md`.
2. **Secondary:** `deep` background, `mid` border, muted text. Border brightens + background tints on hover.
3. **Ghost:** Transparent, faint text/border. Fills with `glow-dim` background on hover.

### Input (Search, settings fields)

`deep` background, `mid` border, `foam` text. Focus state: border becomes `glow`, `glow-sm` shadow, subtle `glow-dim` background tint. Mono font for search/code inputs; sans for settings labels.

### Status Badge

Pill shape (20px radius), mono font, 9-9.5px, uppercase, letter-spaced. Each status has distinct background tint + border + text color from semantic palette. Running badge gets a subtle pulse animation.

### Toggle

44x24px track, 18px circular thumb, `spring` easing. Off: `surface` track. On: `glow` track color. Thumb casts small shadow.

## Layout Architecture

### Main Grid (Dashboard View)

```
┌──────────┬──────────────────────┬──────────┐
│          │                      │          │
│  Fleet   │    Vessel Panel      │  Cargo   │
│  (280px) │    (flex-1)          │  (360px) │
│          │                      │          │
│          ├──────────────────────┤          │
│          │                      │          │
│          │  [tabs: Crew/Term/   │          │
│          │   Engine]            │          │
│          │                      │          │
├──────────┴──────────────────────┴──────────┤
│                  Ship's Log (Feed)           │
│                  (170px min)                 │
├────────────────────────────────────────────┤
│              Bottom Navigation (48px)        │
└────────────────────────────────────────────┘
```

- Fleet panel spans both rows (full height minus title bar and bottom nav).
- Bottom nav uses centered items with active indicator (small glow bar below).
- Overlay views (Captain's Log, Charts, Helm) occupy the full area between title bar and bottom nav.

### Responsive Note

Bridge is a desktop-only Tauri app (MVP). Minimum window size: 1024x680. Panels use fixed sidebar widths with flexible center. No mobile breakpoint needed for v0.1. Future: resizable panel splitters.

## References

### Visual References (What to Steal From)

- **Monokai Pro** color warmth: the way it balances charcoal backgrounds with vivid but never garish accents. Bridge's palette extends this logic into a full UI system.
- **Hyper terminal** density: how much information fits without feeling cramped. The balance of small type, tight spacing, and clear visual hierarchy.
- **Kite Compositor** / **Dash** toolbar: native macOS feel in a dark context. Title bars, bottom nav, and panel chrome that feels like part of the OS, not a web page inside a shell.
- **Blender** viewport: dark professional tool where color is functional. The way selection highlight, active state, and hierarchy are communicated through a single accent color system.

### Anti-References (What to Avoid)

- Reiterated from PRODUCT.md: no generic SaaS card grids, no hero metrics, no glassmorphism defaults, no gradient text, no side-stripe borders (except the vessel active-left-border which is a deliberate selection indicator, not a decorative accent).
- No electron-app flatness: Bridge shouldn't look like a website that got wrapped in a window. Native-feeling chrome, proper title bar integration, context menus.
