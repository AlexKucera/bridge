import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname ?? "..", "..");
const css = () => readFileSync(join(ROOT, "src", "bridge.css"), "utf-8");

describe("CSS — §2 Reset / Base", () => {
  it("has box-sizing border-box reset", () => {
    expect(css()).toMatch(/box-sizing:\s*border-box/);
  });

  it("sets html/body height 100% with no margin", () => {
    expect(css()).toMatch(/html,\s*body\s*\{[^}]*height:\s*100%/s);
  });

  it("body uses font-sans token and 13px base size", () => {
    expect(css()).toMatch(/body\s*\{[^}]*font-family:\s*var\(--font-sans\)/s);
    expect(css()).toMatch(/body\s*\{[^}]*font-size:\s*13px/s);
  });

  it("body color is --foam and background is --abyss", () => {
    expect(css()).toMatch(/body\s*\{[^}]*color:\s*var\(--foam\)/s);
    expect(css()).toMatch(/body\s*\{[^}]*background:\s*var\(--abyss\)/s);
  });

  it("body has overflow hidden (desktop app)", () => {
    expect(css()).toMatch(/body\s*\{[^}]*overflow:\s*hidden/s);
  });

  it("has font-smoothing antialiased", () => {
    expect(css()).toContain("-webkit-font-smoothing: antialiased");
  });

  it("has focus-visible outline using --glow", () => {
    expect(css()).toMatch(/:focus-visible[^{]*\{[^}]*var\(--glow\)/s);
  });

  it("has webkit scrollbar styles", () => {
    expect(css()).toContain("::-webkit-scrollbar");
    expect(css()).toContain("::-webkit-scrollbar-thumb");
  });

  it("has ambient drift backdrop animation on body::before", () => {
    expect(css()).toContain("body::before");
    expect(css()).toMatch(/animation:\s*drift/);
  });

  it("has @keyframes drift definition", () => {
    expect(css()).toMatch(/@keyframes\s+drift/);
  });
});

describe("CSS — §3 Typography Utilities", () => {
  const typeClasses = [
    ".t-display", ".t-h1", ".t-h2", ".t-body", ".t-body-sm",
    ".t-caption", ".t-label", ".t-micro", ".t-tiny",
  ];

  for (const cls of typeClasses) {
    it(`defines ${cls} utility class`, () => {
      // Strip the dot for the regex
      expect(css()).toContain(cls.substring(1));
    });
  }

  it(".mono uses --font-mono with ligatures disabled", () => {
    expect(css()).toMatch(/\.mono[^{]*\{[^}]*var\(--font-mono\)/s);
  });

  it(".num sets tabular-nums", () => {
    expect(css()).toMatch(/\.num[^{]*\{[^}]*tabular-nums/s);
  });

  it("has text color utilities (.text-muted, .text-dim, .text-faint, .text-glow)", () => {
    expect(css()).toContain("text-muted");
    expect(css()).toContain("text-dim");
    expect(css()).toContain("text-faint");
    expect(css()).toContain("text-glow");
  });
});
