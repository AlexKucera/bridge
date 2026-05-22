import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname ?? "..", "..");

describe("Launchable Tauri App", () => {
  it("index.html has correct title 'Bridge'", () => {
    const html = readFileSync(join(ROOT, "index.html"), "utf-8");
    expect(html).toMatch(/<title>Bridge/);
  });

  it("bridge.css is imported via main.tsx (Vite convention)", () => {
    const ts = readFileSync(join(ROOT, "src", "main.tsx"), "utf-8");
    expect(ts).toContain("bridge.css");
  });

  it("index.html does NOT import template style.css", () => {
    const html = readFileSync(join(ROOT, "index.html"), "utf-8");
    expect(html).not.toContain("style.css");
  });

  it("main.tsx uses SolidJS render(), not raw innerHTML", () => {
    const ts = readFileSync(join(ROOT, "src", "main.tsx"), "utf-8");
    expect(ts).toMatch(/render\s*\(/);
    expect(ts).not.toContain("innerHTML");
  });

  it("main.tsx has no Vite template boilerplate (counter, hero images)", () => {
    const ts = readFileSync(join(ROOT, "src", "main.tsx"), "utf-8");
    expect(ts).not.toContain("setupCounter");
    expect(ts).not.toContain("hero.png");
    expect(ts).not.toContain("Get started");
  });

  it("App.tsx renders the app chrome (titlebar + bottomnav + DS classes)", () => {
    const app = readFileSync(join(ROOT, "src", "App.tsx"), "utf-8");
    expect(app).toContain("titlebar");
    expect(app).toContain("bottomnav");
    expect(app).toContain("tb-pill");
  });
});
