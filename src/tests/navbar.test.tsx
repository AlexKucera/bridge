/* BottomNavBar behavior tests
   Tests the presentational nav bar component in isolation.
   No router dependency — receives currentPath as a prop. */

import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { BottomNavBar, NAV_ITEMS, isActiveNav } from "../components/BottomNavBar";

describe("BottomNavBar", () => {
  it("renders 5 navigation buttons", async () => {
    render(() => <BottomNavBar currentPath="/welcome" />);
    const nav = await screen.findByRole("navigation", { name: "Main navigation" });
    const links = nav.querySelectorAll(".navbtn");
    expect(links.length).toBe(5);
  });

  it("shows correct labels: Fleet, Charts, Log, Helm, Welcome", async () => {
    render(() => <BottomNavBar currentPath="/welcome" />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav).toHaveTextContent("Fleet");
    expect(nav).toHaveTextContent("Charts");
    expect(nav).toHaveTextContent("Log");
    expect(nav).toHaveTextContent("Helm");
    expect(nav).toHaveTextContent("Welcome");
  });

  it("marks Welcome as active when at /welcome", async () => {
    render(() => <BottomNavBar currentPath="/welcome" />);
    const link = screen.getByRole("link", { name: /Welcome/i });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks Fleet as active when at /fleet", async () => {
    render(() => <BottomNavBar currentPath="/fleet" />);
    const link = screen.getByRole("link", { name: /Fleet/i });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks Charts as active when at /charts", async () => {
    render(() => <BottomNavBar currentPath="/charts" />);
    const link = screen.getByRole("link", { name: /Charts/i });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks Log as active when at /log", async () => {
    render(() => <BottomNavBar currentPath="/log" />);
    const link = screen.getByRole("link", { name: /Log/i });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("marks Helm as active when at /helm", async () => {
    render(() => <BottomNavBar currentPath="/helm" />);
    const link = screen.getByRole("link", { name: /Helm/i });
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("only one nav item is active at a time", async () => {
    render(() => <BottomNavBar currentPath="/fleet" />);
    const allLinks = screen.getAllByRole("link");
    const activeLinks = allLinks.filter(
      (l) => l.getAttribute("aria-current") === "page"
    );
    expect(activeLinks.length).toBe(1);
    expect(activeLinks[0]).toHaveTextContent("Fleet");
  });

  it("renders status indicator text", async () => {
    render(() => <BottomNavBar currentPath="/welcome" />);
    expect(screen.getByText("All systems nominal")).toBeInTheDocument();
  });

  it("calls onNavigate when a nav item is clicked", async () => {
    const handler = (href: string) => void href;
    const spy = vi.fn();
    render(() => <BottomNavBar currentPath="/welcome" onNavigate={spy} />);
    const fleetLink = screen.getByRole("link", { name: /Fleet/i });
    fleetLink.click();
    expect(spy).toHaveBeenCalledWith("/fleet");
  });
});

describe("isActiveNav helper", () => {
  it("matches /welcome for root path /", () => {
    expect(isActiveNav("/welcome", "/")).toBe(true);
  });

  it("matches /welcome for /welcome path", () => {
    expect(isActiveNav("/welcome", "/welcome")).toBe(true);
  });

  it("does not match /welcome for /fleet path", () => {
    expect(isActiveNav("/welcome", "/fleet")).toBe(false);
  });

  it("matches /fleet for /fleet and subpaths", () => {
    expect(isActiveNav("/fleet", "/fleet")).toBe(true);
    expect(isActiveNav("/fleet", "/fleet/vsl-1")).toBe(true);
  });
});

describe("NAV_ITEMS constant", () => {
  it("has exactly 5 items", () => {
    expect(NAV_ITEMS.length).toBe(5);
  });

  it("has correct order: Fleet, Charts, Log, Helm, Welcome", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual([
      "Fleet", "Charts", "Log", "Helm", "Welcome",
    ]);
  });

  it("each item has href, label, and icon", () => {
    for (const item of NAV_ITEMS) {
      expect(item.href).toBeTruthy();
      expect(item.label).toBeTruthy();
      expect(item.icon).toBeTruthy();
    }
  });
});
