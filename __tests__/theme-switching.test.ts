import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname ?? "..", "..");
const css = () => readFileSync(join(ROOT, "src", "bridge.css"), "utf-8");

describe("Theme Switching — data-theme='light'", () => {
  it("defines :root[data-theme='light'] block", () => {
    expect(css()).toMatch(/:root\[data-theme="light"\]/);
  });

  it("light theme inverts surface stack to paper (high lightness)", () => {
    const lightMatch = css().match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)(?=\n\}|\n:[^\s]|$)/)?.[1] ?? "";
    // Paper backgrounds should have high L (0.88+)
    expect(lightMatch).toMatch(/--abyss:\s*oklch\(0\.9[5-9]/);
    expect(lightMatch).toMatch(/--panel:\s*oklch\(1\.00/);
  });

  it("light theme inverts text to ink (low lightness)", () => {
    const lightMatch = css().match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)(?=\n\}|\n:[^\s]|$)/)?.[1] ?? "";
    // Ink text should have low L (< 0.3 for foam)
    expect(lightMatch).toMatch(/--foam:\s*oklch\(0\.[12]/);
    expect(lightMatch).toMatch(/--muted:\s*oklch\(0\.4/);
  });

  it("light theme drops accent glow lightness for contrast on paper", () => {
    const lightMatch = css().match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)(?=\n\}|\n:[^\s]|$)/)?.[1] ?? "";
    expect(lightMatch).toMatch(/--glow:\s*oklch\(0\.52/);
  });

  it("light theme overrides border tokens to solid oklch (not color-mix)", () => {
    const lightMatch = css().match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)(?=\n\}|\n:[^\s]|$)/)?.[1] ?? "";
    expect(lightMatch).toContain("--border-base");
    expect(lightMatch).toContain("--border-raised");
  });

  it("light theme tones down ambient drift backdrop", () => {
    expect(css()).toMatch(/:root\[data-theme="light"\]\s+body::before/);
  });
});

describe("Accent Switching — data-accent", () => {
  const accents = [
    { name: "sea", hue: 155 },
    { name: "brass", hue: 75 },
    { name: "cargo", hue: 230 },
    { name: "crew", hue: 300 },
  ];

  for (const { name, hue } of accents) {
    it(`defines :root[data-accent="${name}"] with --glow trio at hue ${hue}`, () => {
      const re = new RegExp(`:root\\[data-accent="${name}"\\]`);
      expect(css()).toMatch(re);
      const block = css().match(new RegExp(`:root\\[data-accent="${name}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
      expect(block).toContain("--glow");
      expect(block).toContain("--glow-dim");
      expect(block).toContain("--glow-strong");
      // All three should use the correct hue
      const glowMatches = block.match(new RegExp(`oklch\\([^)]*${hue}\\)`, "g"));
      expect(glowMatches?.length ?? 0).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("Density Switching — data-density", () => {
  it("defines :root[data-density='compact'] with smaller spacing", () => {
    expect(css()).toMatch(/:root\[data-density="compact"\]/);
    const block = css().match(/:root\[data-density="compact"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    // Compact spacing should be smaller than default
    expect(block).toMatch(/--sp-xs:\s*3px/);
    expect(block).toMatch(/--sp-3xl:\s*24px/);
  });

  it("defines :root[data-density='comfortable'] with larger spacing", () => {
    expect(css()).toMatch(/:root\[data-density="comfortable"\]/);
    const block = css().match(/:root\[data-density="comfortable"\]\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    // Comfortable spacing should be larger than default
    expect(block).toMatch(/--sp-xs:\s*5px/);
    expect(block).toMatch(/--sp-3xl:\s*44px/);
  });

  it("compact density sets body font-size to 12px", () => {
    expect(css()).toMatch(/data-density="compact"\]\s*body\s*\{[^}]*font-size:\s*12px/s);
  });

  it("comfortable density sets body font-size to 14px", () => {
    expect(css()).toMatch(/data-density="comfortable"\]\s*body\s*\{[^}]*font-size:\s*14px/s);
  });
});

describe("Prefers Reduced Motion", () => {
  it("has @media (prefers-reduced-motion: reduce) block", () => {
    expect(css()).toMatch(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/);
  });

  it("crushes animation-duration to near-zero", () => {
    const rmBlock = css().match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(rmBlock).toContain("animation-duration: 0.001ms !important");
    expect(rmBlock).toContain("transition-duration: 0.001ms !important");
  });

  it("disables drift animation specifically", () => {
    const rmBlock = css().match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(rmBlock).toContain("body::before");
  });
});
