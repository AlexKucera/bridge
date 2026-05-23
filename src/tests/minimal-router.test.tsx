/* Router test — verified working pattern */
import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { Route, A } from "@solidjs/router";

describe("Router (working pattern)", () => {
  const App = () => (
    <>
      <Route path="/a" component={() => (
        <div>
          <h1>Page A</h1>
          <A href="/b">Go to B</A>
        </div>
      )} />
      <Route path="/b" component={() => <h1>Page B</h1>} />
    </>
  );

  it("renders route A at /a using location option", async () => {
    const { findByText } = render(() => <App />, { location: "/a" });
    expect(await findByText("Page A")).toBeInTheDocument();
    expect(screen.getByText("Go to B")).toBeInTheDocument();
  });

  it("renders route B at /b", async () => {
    const { findByText } = render(() => <App />, { location: "/b" });
    expect(await findByText("Page B")).toBeInTheDocument();
  });

  it("navigates from A to B on click", async () => {
    const { findByText } = render(() => <App />, { location: "/a" });
    expect(await findByText("Page A")).toBeInTheDocument();
    (await findByText("Go to B")).click();
    expect(await findByText("Page B")).toBeInTheDocument();
  });
});
