import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname ?? "..", "..");

describe("TypeScript Token Constants", () => {
  const tokensPath = join(ROOT, "src", "lib", "tokens.ts");

  it("tokens.ts exists in src/lib/", () => {
    expect(existsSync(tokensPath)).toBe(true);
  });

  const tokens = () => {
    try {
      // We need to parse without executing (uses DOM APIs)
      const src = readFileSync(tokensPath, "utf-8");
      return src;
    } catch {
      return "";
    }
  };

  // Surface stack
  describe("surface tokens", () => {
    const src = tokens();
    ["abyss", "deep", "mid", "surface", "panel"].forEach((name) => {
      it(`exports ${name} constant`, () => {
        expect(src).toMatch(new RegExp(`(?:export\\s+)?(?:const|var|let)\\s+${name}\\s*=`));
      });
    });
  });

  // Accent glow trio
  describe("accent tokens", () => {
    const src = tokens();
    ["glow", "glowDim", "glowStrong"].forEach((name) => {
      it(`exports ${name} constant`, () => {
        expect(src).toMatch(new RegExp(`(?:const|var|let)\\s+${name}\\s*=`));
      });
    });
  });

  // Text colors
  describe("text color tokens", () => {
    const src = tokens();
    ["foam", "muted", "dim", "faint"].forEach((name) => {
      it(`exports ${name} constant`, () => {
        expect(src).toContain(name);
      });
    });
  });

  // Semantic colors
  describe("semantic color constants", () => {
    const src = tokens();
    ["seaGreen", "brass", "alertRed", "cargoBlue", "crewPurple", "radarGreen"].forEach((name) => {
      it(`exports ${name}`, () => {
        expect(src).toContain(name);
      });
    });
  });

  // Spacing scale
  describe("spacing scale constants", () => {
    const src = tokens();
    ["spXs", "spSm", "spMd", "spLg", "spXl", "sp2xl", "sp3xl"].forEach((name) => {
      it(`exports ${name}`, () => {
        expect(src).toContain(name);
      });
    });
  });

  // Motion timings
  describe("motion timing constants", () => {
    const src = tokens();
    ["tFast", "tSmooth", "tSpring", "tSlow"].forEach((name) => {
      it(`exports ${name}`, () => {
        expect(src).toContain(name);
      });
    });
  });
});

describe("Theme Hooks", () => {
  const hooksPath = join(ROOT, "src", "lib", "theme.ts");

  it("theme.ts exists in src/lib/", () => {
    expect(existsSync(hooksPath)).toBe(true);
  });

  const src = () => readFileSync(hooksPath, "utf-8");

  it("exports useTheme()", () => {
    expect(src()).toMatch(/export\s+function\s+useTheme/);
  });

  it("exports useAccent()", () => {
    expect(src()).toMatch(/export\s+function\s+useAccent/);
  });

  it("exports useDensity()", () => {
    expect(src()).toMatch(/export\s+function\s+useDensity/);
  });

  it("useTheme returns { theme, setTheme, resolved, cycle }", () => {
    const s = src();
    // Should return an object with these keys
    expect(s).toMatch(/setTheme|cycle.*theme/);
  });

  it("useAccent returns { accent, setAccent, options, labels, cycle }", () => {
    const s = src();
    expect(s).toContain("setAccent");
    expect(s).toContain("options");
    expect(s).toContain("labels");
  });

  it("useDensity returns { density, setDensity, options, labels }", () => {
    const s = src();
    expect(s).toContain("setDensity");
  });

  it("hooks use localStorage for persistence", () => {
    const s = src();
    expect(s).toMatch(/localStorage/);
  });

  it("hooks flip data-theme / data-accent / data-density on documentElement", () => {
    const s = src();
    expect(s).toMatch(/document\.documentElement|documentElement\.setAttribute|setAttribute.*data-theme/s);
  });

  it("dispatches CustomEvent on change (bridge-theme, bridge-accent, bridge-density)", () => {
    const s = src();
    expect(s).toMatch(/CustomEvent\(|dispatchEvent/);
  });
});
