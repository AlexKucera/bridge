/* WelcomeScreen navigation card tests
   Tests that the 4 preview cards (Fleet, Charts, Log, Helm) link
   to their respective routes. Verifies hrefs and card structure. */

import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Route } from "@solidjs/router";
import { WelcomeScreen } from "../screens/WelcomeScreen";

describe("WelcomeScreen navigation cards", () => {
  function renderWithRouter() {
    return render(() => (
      <>
        <Route path="/welcome" component={WelcomeScreen} />
        <Route path="*" component={() => <h1>Not Found</h1>} />
      </>
    ), {
      location: "/welcome",
    });
  }

  it("renders 4 navigation preview cards", async () => {
    const { findAllByRole } = renderWithRouter();
    const cards = await findAllByRole("link");
    const screenCards = cards.filter((c) =>
      c.className.includes("screen-card")
    );
    expect(screenCards.length).toBe(4);
  });

  it("Fleet card has href /fleet and shows section 01", async () => {
    renderWithRouter();
    const fleetCard = await screen.findByRole("link", { name: /Fleet Dashboard/i });
    expect(fleetCard.getAttribute("href")).toBe("/fleet");
    expect(fleetCard.textContent).toContain("01");
  });

  it("Charts card has href /charts and shows section 02", async () => {
    renderWithRouter();
    const chartsCard = await screen.findByRole("link", { name: /Fleet Charts/i });
    expect(chartsCard.getAttribute("href")).toBe("/charts");
    expect(chartsCard.textContent).toContain("02");
  });

  it("Log card has href /log and shows section 03", async () => {
    renderWithRouter();
    const logCard = await screen.findByRole("link", { name: /Captain.s Log/i });
    expect(logCard.getAttribute("href")).toBe("/log");
    expect(logCard.textContent).toContain("03");
  });

  it("Helm card has href /helm and shows section 04", async () => {
    renderWithRouter();
    const helmCard = await screen.findByRole("link", { name: /Helm Panel/i });
    expect(helmCard.getAttribute("href")).toBe("/helm");
    expect(helmCard.textContent).toContain("04");
  });

  it("cards show section numbers 01–04", async () => {
    renderWithRouter();
    expect(await screen.findByText("01")).toBeInTheDocument();
    expect(await screen.findByText("02")).toBeInTheDocument();
    expect(await screen.findByText("03")).toBeInTheDocument();
    expect(await screen.findByText("04")).toBeInTheDocument();
  });

  it("renders hero section with app name and tagline", async () => {
    renderWithRouter();
    expect(await screen.findByText("Bridge")).toBeInTheDocument();
    expect(await screen.findByText(/Mission Control for your scripting fleet/)).toBeInTheDocument();
  });

  it("shows technology badges: Tauri v2, SolidJS, Pi-first", async () => {
    renderWithRouter();
    expect(await screen.findByText("Tauri v2")).toBeInTheDocument();
    expect(await screen.findByText("SolidJS")).toBeInTheDocument();
    expect(await screen.findByText("Pi-first")).toBeInTheDocument();
  });
});
