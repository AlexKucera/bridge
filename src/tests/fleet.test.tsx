/* Fleet Dashboard — 3-column layout test

   Verifies the FleetDashboard renders a 3-column grid:
   sidebar (180px) | fluid content | activity feed (280px) */

import { describe, it, expect } from "vitest";
import { render } from "@solidjs/testing-library";
import { FleetDashboard } from "../screens/FleetDashboard";

describe("FleetDashboard", () => {
  it("renders a 3-column layout with sidebar, content, and feed", () => {
    render(() => <FleetDashboard />);

    const el = document.querySelector(".fleet-dashboard");
    expect(el).not.toBeNull();

    // Should have sidebar, content, and feed as direct children
    const sidebar = el?.querySelector(":scope > .fleet-sidebar");
    const content = el?.querySelector(":scope > .fleet-content");
    const feed = el?.querySelector(":scope > .feed-panel");

    expect(sidebar).not.toBeNull("should have .fleet-sidebar child");
    expect(content).not.toBeNull("should have .fleet-content child");
    expect(feed).not.toBeNull("should have .feed-panel child");
  });

  it("uses CSS grid for the dashboard area", () => {
    render(() => <FleetDashboard />);
    const dashboard = document.querySelector(".fleet-dashboard");

    expect(dashboard?.classList.contains("grid")).toBe(true);
  });
});
