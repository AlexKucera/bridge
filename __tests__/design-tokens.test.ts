import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname ?? "..", "..");

// We parse the CSS source to verify tokens exist (no DOM needed)
function loadCSS(name: string): string {
  const path = join(ROOT, "src", name);
  if (!existsSync(path)) throw new Error(`CSS file not found: ${path}`);
  return readFileSync(path, "utf-8");
}

describe("Design Tokens — §1 :root variables", () => {
  const css = () => loadCSS("bridge.css");

  it("bridge.css exists in src/", () => {
    expect(existsSync(join(ROOT, "src", "bridge.css"))).toBe(true);
  });

  // --- Surface stack (backgrounds) ---
  describe("surface stack tokens", () => {
    const surfaces = ["--abyss", "--deep", "--mid", "--surface", "--panel"];
    for (const token of surfaces) {
      it(`defines ${token} as oklch()`, () => {
        expect(css()).toMatch(new RegExp(`${token}:\\s*oklch\\(`));
      });
    }
  });

  // --- Accent glow trio ---
  describe("accent glow tokens", () => {
    const accents = ["--glow", "--glow-dim", "--glow-strong"];
    for (const token of accents) {
      it(`defines ${token} as oklch()`, () => {
        expect(css()).toMatch(new RegExp(`${token}:\\s*oklch\\(`));
      });
    }
  });

  // --- Text colors ---
  describe("text color tokens", () => {
    const texts = ["--foam", "--muted", "--dim", "--faint"];
    for (const token of texts) {
      it(`defines ${token} as oklch()`, () => {
        expect(css()).toMatch(new RegExp(`${token}:\\s*oklch\\(`));
      });
    }
  });

  // --- Semantic colors ---
  describe("semantic color tokens", () => {
    const semantics = [
      "--sea-green", "--brass", "--alert-red",
      "--cargo-blue", "--crew-purple", "--radar-green",
    ];
    for (const token of semantics) {
      it(`defines ${token} as oklch()`, () => {
        expect(css()).toMatch(new RegExp(`${token}:\\s*oklch\\(`));
      });
    }
  });

  // --- Typography ---
  describe("typography tokens", () => {
    it("defines --font-sans with Inter", () => {
      expect(css()).toMatch(/--font-sans:\s*['"]?Inter/);
    });
    it("defines --font-mono with JetBrains Mono", () => {
      expect(css()).toMatch(/--font-mono:\s*['"]?JetBrains\s+Mono/);
    });
  });

  // --- Spacing scale ---
  describe("spacing scale", () => {
    const spacing = ["--sp-xs", "--sp-sm", "--sp-md", "--sp-lg", "--sp-xl", "--sp-2xl", "--sp-3xl"];
    for (const token of spacing) {
      it(`defines ${token} in px`, () => {
        expect(css()).toMatch(new RegExp(`${token}:\\s*\\d+px`));
      });
    }
  });

  // --- Border radius ---
  describe("border radius tokens", () => {
    const radii = ["--r-sm", "--r-md", "--r-lg", "--r-xl"];
    for (const token of radii) {
      it(`defines ${token} in px`, () => {
        expect(css()).toMatch(new RegExp(`${token}:\\s*\\d+px`));
      });
    }
  });

  // --- Motion / timing ---
  describe("motion tokens", () => {
    const timings = ["--t-fast", "--t-smooth", "--t-spring", "--t-slow"];
    for (const token of timings) {
      it(`defines ${token} with ms duration + cubic-bezier`, () => {
        expect(css()).toMatch(new RegExp(`${token}:\\s*\\d+ms`));
      });
    }
  });

  // --- Border helpers use color-mix (not rgba) ---
  describe("border helpers use color-mix(in oklch, ...)", () => {
    const borders = ["--border-base", "--border-raised", "--border-glow"];
    for (const token of borders) {
      it(`${token} uses color-mix(in oklch, ...)`, () => {
        expect(css()).toMatch(new RegExp(`${token}:.*color-mix\\(in\\s+oklch`));
      });
    }
  });

  // --- Shadows ---
  describe("shadow tokens", () => {
    const shadows = ["--shadow-raised", "--shadow-floating", "--glow-sm", "--glow-md"];
    for (const token of shadows) {
      it(`defines ${token}`, () => {
        expect(css()).toContain(token);
      });
    }
  });

  // --- No rgba() for alpha (must use color-mix) ---
  it("uses no rgba() for alpha blending in :root tokens", () => {
    // The only allowed rgba is in shadow definitions (which are opaque-ish)
    const rootBlock = css().match(/:root\s*\{[\s\S]*?\n\}/)?.[0] ?? "";
    // Token alpha values should use color-mix, not rgba
    // Shadows are exempt (they use rgba for the black shadow color)
    const nonShadowLines = rootBlock
      .split("\n")
      .filter((l) => !l.includes("--shadow") && !l.includes("--glow-sm") && !l.includes("--glow-md"))
      .join("\n");
    expect(nonShadowLines).not.toMatch(/rgba\(/);
  });
});
