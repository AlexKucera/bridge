/* VesselCard component test

   Verifies the VesselCard renders with:
   - Vessel display name
   - Status dot (Idle/Running/Warning/Error)
   - Current branch name
   - Dirty indicator
   - Selection glow border + left accent bar when selected */

import { describe, it, expect } from "vitest";
import { render } from "@solidjs/testing-library";
import { VesselCard } from "../components/VesselCard";

describe("VesselCard", () => {
  const defaultVessel = {
    id: 1,
    name: "bridge",
    path: "/Users/alex/Projects/scripting/bridge",
    display_name: "Bridge",
    created_at: "2026-05-26T00:00:00Z",
    updated_at: "2026-05-26T00:00:00Z",
  };

  it("renders vessel display name", () => {
    render(() => <VesselCard vessel={defaultVessel} />);
    expect(document.querySelector(".vessel-card")).not.toBeNull();
    expect(document.querySelector(".vessel-card__name")?.textContent).toBe("Bridge");
  });

  it("shows status dot", () => {
    render(() => <VesselCard vessel={defaultVessel} status="idle" />);
    expect(document.querySelector(".vessel-card__status")).not.toBeNull();
  });

  it("shows branch name when provided", () => {
    render(() => <VesselCard vessel={defaultVessel} branch="main" />);
    const el = document.querySelector(".vessel-card__branch");
    expect(el?.textContent).toContain("main");
  });

  it("shows dirty indicator when dirty", () => {
    render(() => <VesselCard vessel={defaultVessel} dirty={true} />);
    expect(document.querySelector(".vessel-card__dirty")).not.toBeNull();
  });

  it("does not show dirty indicator when clean", () => {
    render(() => <VesselCard vessel={defaultVessel} dirty={false} />);
    expect(document.querySelector(".vessel-card__dirty")).toBeNull();
  });

  it("applies selection styling when selected", () => {
    render(() => <VesselCard vessel={defaultVessel} selected={true} />);
    const card = document.querySelector(".vessel-card");
    expect(card?.classList.contains("selected")).toBe(true);
  });

  it("renders left accent bar via border-left", () => {
    render(() => <VesselCard vessel={defaultVessel} />);
    const card = document.querySelector(".vessel-card");
    expect(card).not.toBeNull();
    // Accent bar is rendered as border-left on the card element
    const style = window.getComputedStyle(card!);
    expect(style.borderLeftWidth).not.toBe("0px");
  });
});
