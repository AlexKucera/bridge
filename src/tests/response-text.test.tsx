import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { ResponseText } from "../components/execution/ResponseText";

describe("ResponseText", () => {
  it("renders assistant response text", () => {
    render(() => <ResponseText text="Hello, world!" />);
    screen.getByText("Hello, world!");
  });

  it("renders empty state when text is empty", () => {
    render(() => <ResponseText text="" />);
    expect(screen.queryByText(/\w/)).toBeNull();
  });

  it("renders long text without truncation at DOM level (client-side truncation handled by parent)", () => {
    const longText = "A".repeat(1000);
    render(() => <ResponseText text={longText} />);
    const el = screen.getByRole("article");
    expect(el.textContent).toHaveLength(1000);
  });

  it("applies monospace class for code-like content", () => {
    render(() => <ResponseText text="const x = 42;" />);
    const el = screen.getByRole("article");
    expect(el.className).toContain("response-text");
  });
});
