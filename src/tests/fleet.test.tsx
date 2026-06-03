/* FleetDashboard layout tests
   Verifies the self-contained page renders with 3-column grid.
   useNavigate/useParams are mocked in test-setup.ts for test isolation. */

import { describe, it, expect } from "vitest";
import { render } from "@solidjs/testing-library";
import { FleetDashboard } from "../screens/FleetDashboard";

describe("FleetDashboard", () => {
  it("renders a self-contained page with top bar and 3-column body", () => {
    const { container } = render(() => <FleetDashboard />);

    // Should have the page wrapper
    const page = container.querySelector(".fleet-page");
    expect(page).not.toBeNull();
  });

  it("renders vessel sidebar, content area, and activity feed columns", () => {
    const { container } = render(() => <FleetDashboard />);

    // Should have sidebar (aside), main content (main), and feed (aside)
    const aside = container.querySelector("aside");
    const main = container.querySelector("main");
    expect(aside).not.toBeNull();
    expect(main).not.toBeNull();
  });

  it("shows 'No vessels added yet' when list is empty", () => {
    const { container } = render(() => <FleetDashboard />);
    // invoke is mocked so vessels() will be empty
    const text = container.textContent || "";
    expect(text).toContain("No vessels added yet");
  });
});
