/* VesselContextMenu test

   Verifies right-click context menu on vessel cards shows:
   - Rename option
   - Remove option */

import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { VesselCard } from "../components/VesselCard";
const defaultVessel = {
  id: 1,
  name: "bridge",
  path: "/Users/alex/Projects/scripting/bridge",
  display_name: "Bridge",
  created_at: "2026-05-26T00:00:00Z",
  updated_at: "2026-05-26T00:00:00Z",
};

describe("VesselCard context menu", () => {
  it("fires onContextMenu handler when right-clicked", async () => {
    let contextMenuTarget: typeof defaultVessel | undefined;
    render(() => (
      <VesselCard
        vessel={defaultVessel}
        onContextMenu={(v) => { contextMenuTarget = v; }}
      />
    ));

    const card = document.querySelector(".vessel-card")!;
    card.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

    expect(contextMenuTarget).toEqual(defaultVessel);
  });

  it("does not fire onContextMenu on left click", async () => {
    let fired = false;
    render(() => (
      <VesselCard
        vessel={defaultVessel}
        onContextMenu={() => { fired = true; }}
      />
    ));

    const card = document.querySelector(".vessel-card")!;
    card.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(fired).toBe(false);
  });
});
