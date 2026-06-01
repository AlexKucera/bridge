import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { UnknownEventCard } from "../components/execution/UnknownEventCard";

describe("UnknownEventCard", () => {
  it("renders event type in header", () => {
    render(() => <UnknownEventCard event={{ type: "mystery_event", data: "hello" }} />);
    screen.getByText("mystery_event");
  });

  it("renders with 'unknown' fallback when type is missing", () => {
    render(() => <UnknownEventCard event={{ foo: "bar" }} />);
    screen.getByText("unknown");
  });

  it("shows collapsed state by default (no JSON visible)", () => {
    render(() => <UnknownEventCard event={{ type: "test" }} />);
    // Should not show raw JSON when collapsed
    expect(screen.queryByText(/"type"/)).toBeNull();
    // Should show the header button
    screen.getByRole("button", { name: /test/i });
  });

  it("shows raw JSON when expanded", async () => {
    const event = { type: "expanded_test", key: [1, 2, 3] };
    render(() => <UnknownEventCard event={event} />);

    const btn = screen.getByRole("button");
    await userEvent.click(btn);

    // Should now show the JSON representation
    screen.getByText(/"type":/);
    screen.getByText(/"key":/);
  });

  it("collapses back when clicked again", async () => {
    render(() => <UnknownEventCard event={{ type: "toggle_me" }} />);

    const btn = screen.getByRole("button");

    // Expand
    await userEvent.click(btn);
    screen.getByText(/"type"/);

    // Collapse
    await userEvent.click(btn);
    expect(screen.queryByText(/"type"/)).toBeNull();
  });

  it("has correct data-testid and ARIA attributes", () => {
    render(() => <UnknownEventCard event={{ type: "aria_test" }} />);
    const card = screen.getByTestId("unknown-event-card");
    expect(card.getAttribute("role")).toBe("article");
    expect(card.getAttribute("aria-label")).toContain("aria_test");
  });

  it("does not crash on deeply nested events", () => {
    const deepEvent = {
      type: "deep",
      level1: {
        level2: { level3: { level4: "value" } },
        arr: [{ a: 1 }, { b: 2 }],
      },
    };
    render(() => <UnknownEventCard event={deepEvent} />);
    screen.getByTestId("unknown-event-card");
  });
});
