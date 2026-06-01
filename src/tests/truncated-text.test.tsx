import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { TruncatedText } from "../components/execution/TruncatedText";

describe("TruncatedText", () => {
  const TRUNCATE_AT = 50_000; // 50KB

  it("renders short text without truncation UI", () => {
    render(() => <TruncatedText text="Hello world" truncateAt={TRUNCATE_AT} />);
    screen.getByText("Hello world");
    // No truncation indicator
    expect(screen.queryByText(/truncated/i)).toBeNull();
    expect(screen.queryByText(/expand/i)).toBeNull();
  });

  it("renders text under the limit in full", () => {
    const text = "A".repeat(1000);
    render(() => <TruncatedText text={text} truncateAt={TRUNCATE_AT} />);
    const el = screen.getByTestId("truncated-text");
    expect(el.textContent).toHaveLength(1000);
    expect(screen.queryByText(/truncated/i)).toBeNull();
  });

  it("shows truncated preview with '[truncated -- click to expand]' when over limit", () => {
    const text = "X".repeat(60_000);
    render(() => <TruncatedText text={text} truncateAt={TRUNCATE_AT} />);
    // Should show truncation message
    screen.getByText((c) => c.includes("truncated"));
    screen.getByText((c) => c.includes("click to expand"));
    // Should NOT show the full 60K chars
    const el = screen.getByTestId("truncated-text");
    expect(el.textContent!.length).toBeLessThan(51_000);
  });

  it("truncates at exactly the specified byte limit", () => {
    const text = "B".repeat(55_000);
    render(() => <TruncatedText text={text} truncateAt={TRUNCATE_AT} />);
    const el = screen.getByTestId("truncated-text");
    // Visible content should be ~50KB + marker length
    expect(el.textContent!.length).toBeGreaterThan(49_900);
    expect(el.textContent!.length).toBeLessThan(51_000);
  });

  it("reveals full text when 'click to expand' is clicked", async () => {
    const text = "C".repeat(60_000);
    render(() => <TruncatedText text={text} truncateAt={TRUNCATE_AT} />);
    // Initially truncated
    screen.getByText(/truncated/i);

    const expandButton = screen.getByRole("button", { name: /expand/i });
    await userEvent.click(expandButton);

    // Full text should now be visible
    const el = screen.getByTestId("truncated-text");
    // Full text should be visible (button adds a few chars to textContent)
    expect(el.textContent).toContain("C".repeat(60_000));
    // Truncation message should be gone
    expect(screen.queryByText(/truncated/i)).toBeNull();
  });

  it("shows 'collapse' button after expanding", async () => {
    const text = "D".repeat(60_000);
    render(() => <TruncatedText text={text} truncateAt={TRUNCATE_AT} />);

    const expandBtn = screen.getByRole("button", { name: /expand/i });
    await userEvent.click(expandBtn);

    // Should show collapse option
    screen.getByRole("button", { name: /collapse/i });
  });

  it("collapses back to truncated view when 'collapse' is clicked", async () => {
    const text = "E".repeat(60_000);
    render(() => <TruncatedText text={text} truncateAt={TRUNCATE_AT} />);

    // Expand first
    let btn = screen.getByRole("button", { name: /expand/i });
    await userEvent.click(btn);

    // Then collapse
    btn = screen.getByRole("button", { name: /collapse/i });
    await userEvent.click(btn);

    // Back to truncated state
    screen.getByText(/truncated/i);
    const el = screen.getByTestId("truncated-text");
    expect(el.textContent!.length).toBeLessThan(51_000);
  });

  it("handles empty text gracefully", () => {
    render(() => <TruncatedText text="" truncateAt={TRUNCATE_AT} />);
    const el = screen.getByTestId("truncated-text");
    expect(el.textContent).toBe("");
  });
});
