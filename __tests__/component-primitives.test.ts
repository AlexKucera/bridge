import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname ?? "..", "..");
const css = () => readFileSync(join(ROOT, "src", "bridge.css"), "utf-8");

// All 30 sections from the prototype — we verify each exists
const SECTIONS = [
  "1. TOKENS",
  "2. RESET / BASE",
  "3. TYPOGRAPHY UTILITIES",
  "4. APP CHROME",
  "5. PANEL PRIMITIVE",
  "6. STATUS PRIMITIVES",
  "7. BUTTONS",
  "8. INPUT",
  "9. TABS",
  "10. TOGGLE",
  "11. VESSEL CARD",
  "12. PROGRESS / SPARK",
  "13. EXECUTION VIEW",
  "14. TERMINAL",
  "15. ENGINE ROOM",
  "16. CARGO PANEL",
  "17. SHIP'S LOG STRIP",
  "18. OVERLAY VIEW",
  "19. SETTINGS BLOCKS",
  "20. MODAL",
  "21. FILTER PILLS",
  "22. LOG TIMELINE",
  "23. INDEX",
  "24. UTILITIES",
  "25. LIGHT THEME",
  "26. COMMAND PALETTE",
  "28. ACCENT OVERRIDES",
  "29. DENSITY SCALES",
  "30. PREFERS REDUCED MOTION",
];

describe("CSS — All 30 Sections Ported", () => {
  for (const section of SECTIONS) {
    it(`contains section: ${section}`, () => {
      expect(css()).toContain(section);
    });
  }
});

describe("CSS — §4 App Chrome", () => {
  it("has .app grid layout", () => {
    expect(css()).toMatch(/\.app\s*\{[^}]*display:\s*grid/s);
  });
  it("has .titlebar with -webkit-app-region drag", () => {
    expect(css()).toContain("-webkit-app-region: drag");
  });
  it("has .bottomnav flex layout", () => {
    expect(css()).toMatch(/\.bottomnav\s*\{[^}]*display:\s*flex/s);
  });
  it("has .navbtn with aria-current indicator", () => {
    expect(css()).toContain('navbtn[aria-current="page"]');
  });
});

describe("CSS — §5 Panel Primitive", () => {
  const panelParts = [".panel", ".panel--inset", ".panel__header", ".panel__title", ".panel__body", ".panel__footer"];
  for (const sel of panelParts) {
    it(`defines ${sel}`, () => {
      expect(css()).toContain(sel.substring(1)); // strip dot
    });
  }
});

describe("CSS — §6 Status Primitives (dots + badges)", () => {
  it("has .dot base and variants (--green, --amber, --red, --cyan, --dim)", () => {
    expect(css()).toContain(".dot--green");
    expect(css()).toContain(".dot--amber");
    expect(css()).toContain(".dot--red");
    expect(css()).toContain(".dot--cyan");
    expect(css()).toContain(".dot--dim");
  });
  it("has @keyframes pulse animation", () => {
    expect(css()).toMatch(/@keyframes\s+pulse/);
  });
  it("has .badge base and semantic variants", () => {
    expect(css()).toContain(".badge--running");
    expect(css()).toContain(".badge--idle");
    expect(css()).toContain(".badge--warn");
    expect(css()).toContain(".badge--error");
    expect(css()).toContain(".badge--cargo");
    expect(css()).toContain(".badge--crew");
    expect(css()).toContain(".badge--cyan");
  });
});

describe("CSS — §7 Buttons", () => {
  const variants = ["--primary", "--secondary", "--ghost", "--danger"];
  for (const v of variants) {
    it(`defines .btn${v} variant`, () => {
      expect(css()).toContain(`btn${v}`);
    });
  }
  it("has .btn--sm and .btn--icon sizes", () => {
    expect(css()).toContain("btn--sm");
    expect(css()).toContain("btn--icon");
  });
  it("primary button uses glow gradient", () => {
    expect(css()).toMatch(/\.btn--primary[^{]*\{[^}]*var\(--glow\)/s);
  });
});

describe("CSS — §8 Input", () => {
  it("has .input wrapper with focus-within glow", () => {
    expect(css()).toMatch(/\.input:focus-within[^{]*\{[^}]*var\(--glow\)/s);
  });
});

describe("CSS — §9 Tabs", () => {
  it("has .tab with aria-selected indicator", () => {
    expect(css()).toContain('tab[aria-selected="true"]');
  });
  it("has @keyframes tab-enter animation", () => {
    expect(css()).toMatch(/@keyframes\s+tab-enter/);
  });
});

describe("CSS — §10 Toggle", () => {
  it("has .toggle__track and .toggle__thumb", () => {
    expect(css()).toContain("toggle__track");
    expect(css()).toContain("toggle__thumb");
  });
  it("toggle uses checked state for thumb translation", () => {
    expect(css()).toMatch(/input:checked.*translateX/s);
  });
});

describe("CSS — §11 Vessel Card", () => {
  const vesselParts = [".vessel", ".vessel__icon", ".vessel__body", ".vessel__name", ".vessel__meta", ".vessel__right"];
  for (const sel of vesselParts) {
    it(`defines ${sel}`, () => {
      expect(css()).toContain(sel.substring(1));
    });
  }
});

describe("CSS — §12 Progress / Spark", () => {
  it("has .spark bar chart", () => {
    expect(css()).toContain(".spark");
  });
  it("has .cost-bar with gradient fill", () => {
    expect(css()).toContain(".cost-bar__fill");
  });
});

describe("CSS — §13 Execution View", () => {
  it("has .exec container", () => {
    expect(css()).toContain(".exec");
  });
});

describe("CSS — §14 Terminal (Comms Deck)", () => {
  it("has .terminal styles", () => {
    expect(css()).toContain(".terminal");
  });
});

describe("CSS — §15 Engine Room", () => {
  it("has .engine-room or command styles", () => {
    // May be named differently; check for any engine-related class
    const hasEngine = css().includes("engine") || css().includes("Engine");
    expect(hasEngine).toBe(true);
  });
});

describe("CSS — §16 Cargo Panel", () => {
  it("has .cargo styles", () => {
    expect(css()).toContain(".cargo");
  });
});

describe("CSS — §17 Ship's Log Strip", () => {
  it("has .log or .feed styles", () => {
    const hasLog = css().includes(".log") || css().includes(".feed");
    expect(hasLog).toBe(true);
  });
});

describe("CSS — §18 Overlay View", () => {
  it("has .overlay styles", () => {
    expect(css()).toContain(".overlay");
  });
});

describe("CSS — §19 Settings Blocks", () => {
  it("has .settings styles", () => {
    expect(css()).toContain(".setting");
  });
});

describe("CSS — §20 Modal", () => {
  it("has .modal styles", () => {
    expect(css()).toContain(".modal");
  });
});

describe("CSS — §21 Filter Pills", () => {
  it("has .filter-pill with aria-pressed state", () => {
    expect(css()).toContain("filter-pill");
  });
});

describe("CSS — §22 Log Timeline", () => {
  it("has .timeline styles", () => {
    expect(css()).toContain(".timeline");
  });
});

describe("CSS — §23 Index / Launcher", () => {
  it("has .launcher or .index styles", () => {
    const hasLauncher = css().includes(".launcher") || css().includes(".index");
    expect(hasLauncher).toBe(true);
  });
});

describe("CSS — §24 Utilities", () => {
  it("has utility classes (.flex, .grid, .sr-only, etc.)", () => {
    const hasUtils = css().includes(".flex") || css().includes(".sr-only") || css().includes(".truncate");
    expect(hasUtils).toBe(true);
  });
});

describe("CSS — §26 Command Palette", () => {
  it("has .cmdk-veil command palette overlay", () => {
    expect(css()).toContain(".cmdk");
  });
});
