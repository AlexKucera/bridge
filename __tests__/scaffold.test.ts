import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname ?? "..", "..");

describe("Project Scaffold — Tracer Bullet", () => {
  it("has package.json with solid-js dependency", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
    expect(pkg.name).toBe("bridge");
    expect(pkg.dependencies["solid-js"]).toBeDefined();
    expect(pkg.scripts.build).toContain("vite build");
    expect(pkg.scripts.dev).toContain("vite");
    expect(pkg.scripts.test).toBe("vitest run");
  });

  it("has src-tauri/Cargo.toml with required Rust dependencies", () => {
    expect(existsSync(join(ROOT, "src-tauri", "Cargo.toml"))).toBe(true);
    const cargo = readFileSync(join(ROOT, "src-tauri", "Cargo.toml"), "utf-8");

    // Required crates from issue #3
    expect(cargo).toContain('tokio');
    expect(cargo).toContain('serde');
    expect(cargo).toContain('serde_json');
    expect(cargo).toContain('sqlx');
    expect(cargo).toContain('portable-pty');

    // Should be tauri v2
    expect(cargo).toContain('tauri = { version = "2" }');

    // Package metadata
    expect(cargo).toContain('name = "bridge"');
  });

  it("has Vite + SolidJS entry point", () => {
    expect(existsSync(join(ROOT, "index.html"))).toBe(true);
    expect(existsSync(join(ROOT, "src", "main.tsx"))).toBe(true);
    const html = readFileSync(join(ROOT, "index.html"), "utf-8");
    expect(html).toContain("/src/main.tsx");
    expect(html).toMatch(/<div\s+id=["']app["']/);
  });
    expect(existsSync(join(ROOT, "index.html"))).toBe(true);
    expect(existsSync(join(ROOT, "src", "main.ts"))).toBe(true);
    const html = readFileSync(join(ROOT, "index.html"), "utf-8");
    expect(html).toContain("/src/main.ts");
    expect(html).toMatch(/<div\s+id=["']app["']/);
  });

  it("has Tauri config pointing to correct dev URL and dist", () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf-8"));
    expect(cfg.build.devUrl).toBe("http://localhost:1420");
    expect(cfg.build.frontendDist).toBe("dist");
    expect(cfg.app.windows).toHaveLength(1);
    expect(cfg.app.windows[0].title).toContain("Bridge");
  });

  it("has vitest config with jsdom environment", () => {
    expect(existsSync(join(ROOT, "vitest.config.ts"))).toBe(true);
    const vc = readFileSync(join(ROOT, "vitest.config.ts"), "utf-8");
    expect(vc).toContain("jsdom");
  });

  it("SolidJS entry point (main.tsx) exists and is valid TS", () => {
    expect(existsSync(join(ROOT, "src", "main.tsx"))).toBe(true);
    const src = readFileSync(join(ROOT, "src", "main.tsx"), "utf-8");
    // Should import SolidJS-rendered content
    expect(src).toContain("#app");
  });
    expect(existsSync(join(ROOT, "src", "main.ts"))).toBe(true);
    const src = readFileSync(join(ROOT, "src", "main.ts"), "utf-8");
    // Should import SolidJS-rendered content
    expect(src).toContain("#app");
  });

  it("frontend build produces dist/ output", () => {
    expect(existsSync(join(ROOT, "dist", "index.html"))).toBe(true);
    const html = readFileSync(join(ROOT, "dist", "index.html"), "utf-8");
    expect(html).toContain("<script");
  });
});
