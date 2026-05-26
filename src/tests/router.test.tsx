/* Router configuration tests
   Verifies @solidjs/router maps URL paths to screen components.
   Uses the location option (implicit router) — no <Router> wrapper.

   We test routes directly rather than through App, because App wraps
   them in <Router> which conflicts with the testing library's
   built-in router integration. */

import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Route } from "@solidjs/router";
import { WelcomeScreen } from "../screens/WelcomeScreen";
import { FleetDashboard } from "../screens/FleetDashboard";
import { FleetChartsScreen } from "../screens/FleetChartsScreen";
import { CaptainsLogScreen } from "../screens/CaptainsLogScreen";
import { HelmPanel } from "../screens/HelmPanel";

/* Component that declares all app routes (same as inside App's <Router>) */
function BridgeRoutes() {
  return (
    <>
      <Route path="/welcome" component={WelcomeScreen} />
      <Route path="/fleet" component={FleetDashboard} />
      <Route path="/charts" component={FleetChartsScreen} />
      <Route path="/log" component={CaptainsLogScreen} />
      <Route path="/helm" component={HelmPanel} />
    </>
  );
}

describe("Router", () => {
  it("renders WelcomeScreen with hero heading at /welcome", async () => {
    const { findByRole } = render(() => <BridgeRoutes />, { location: "/welcome" });
    const hero = await findByRole("heading", { level: 1, name: /Bridge/i });
    expect(hero).toBeInTheDocument();
  });

  it("renders WelcomeScreen tagline at /welcome", async () => {
    const { findByText } = render(() => <BridgeRoutes />, { location: "/welcome" });
    expect(await findByText(/mission control/i)).toBeInTheDocument();
  });

  it("renders FleetDashboard stub at /fleet", async () => {
    const { findByText } = render(() => <BridgeRoutes />, { location: "/fleet" });
    expect(await findByText(/Fleet overview coming/i)).toBeInTheDocument();
  });

  it("renders FleetChartsScreen stub at /charts", async () => {
    const { findByText } = render(() => <BridgeRoutes />, { location: "/charts" });
    expect(await findByText(/Analytics and metrics coming/i)).toBeInTheDocument();
  });

  it("renders CaptainsLogScreen stub at /log", async () => {
    const { findByText } = render(() => <BridgeRoutes />, { location: "/log" });
    expect(await findByText(/Captain.s Log/i)).toBeInTheDocument();
  });

  it("renders HelmPanel stub at /helm", async () => {
    const { findByText } = render(() => <BridgeRoutes />, { location: "/helm" });
    expect(await findByText(/Vessel command interface coming/i)).toBeInTheDocument();
  });

  it("renders meta badges on WelcomeScreen", async () => {
    const { findAllByText } = render(() => <BridgeRoutes />, { location: "/welcome" });
    const badges = await findAllByText(/Tauri v2|SolidJS|Pi-first/i);
    expect(badges.length).toBe(3);
  });
});
