/* App.tsx — Bridge root with router
   Uses @solidjs/router with ChromeLayout as the root layout.
   All routes render inside the shared chrome shell.

   Pattern: Router > Route(layout) > Route(leaf) means ChromeLayout
   receives props.children which renders the matched leaf route. */

import { Router, Route, Navigate } from "@solidjs/router";
import { ChromeLayout } from "./components/ChromeLayout";
import { WelcomeScreen } from "./screens/WelcomeScreen";
import { FleetDashboard } from "./screens/FleetDashboard";
import { FleetChartsScreen } from "./screens/FleetChartsScreen";
import { CaptainsLogScreen } from "./screens/CaptainsLogScreen";
import { HelmPanel } from "./screens/HelmPanel";
import { VesselDetailScreen } from "./screens/VesselDetailScreen";

export function App() {
  return (
    <Router>
      <Route path="/" component={ChromeLayout}>
        <Navigate href="/welcome" />
        <Route path="/welcome" component={WelcomeScreen} />
        <Route path="/fleet" component={FleetDashboard} />
        <Route path="/charts" component={FleetChartsScreen} />
        <Route path="/log" component={CaptainsLogScreen} />
        <Route path="/helm" component={HelmPanel} />
        <Route path="/vessel/:id" component={VesselDetailScreen} />
      </Route>
    </Router>
  );
}
