import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { ThinkingBubble } from "../components/execution/ThinkingBubble";

describe("ThinkingBubble", () => {
  it("renders collapsed state with placeholder text", () => {
    render(() => <ThinkingBubble text="Some reasoning" isCollapsed={true} />);
    screen.getByText(/thinking/i);
  });

  it("renders expanded state with full thinking text", () => {
    const text = "Let me think about this carefully...";
    render(() => <ThinkingBubble text={text} isCollapsed={false} />);
    screen.getByText(text);
  });

  it("does not show full text when collapsed", () => {
    render(() => <ThinkingBubble text="Secret reasoning" isCollapsed={true} />);
    expect(screen.queryByText("Secret reasoning")).toBeNull();
  });

  it("fires onToggle callback when clicked", async () => {
    let toggled = false;
    render(() => (
      <ThinkingBubble
        text="Hello"
        isCollapsed={true}
        onToggle={() => { toggled = true; }}
      />
    ));
    await userEvent.click(screen.getByText(/thinking/i));
    expect(toggled).toBe(true);
  });

  // ─── Streaming (Slice 8) ──────────────────────────────

  it("shows ellipsis element when isStreaming=true", () => {
    render(() => (
      <ThinkingBubble text="Reasoning" isCollapsed={false} isStreaming={true} />
    ));
    screen.getByTestId("thinking-ellipsis");
  });

  it("does not show ellipsis when not streaming", () => {
    render(() => (
      <ThinkingBubble text="Reasoning" isCollapsed={false} isStreaming={false} />
    ));
    expect(screen.queryByTestId("thinking-ellipsis")).toBeNull();
  });

  it("applies streaming CSS class when actively streaming", () => {
    render(() => (
      <ThinkingBubble text="Reasoning" isCollapsed={false} isStreaming={true} />
    ));
    const el = screen.getByTestId("thinking-bubble");
    expect(el.classList.contains("thinking-bubble--streaming")).toBe(true);
  });
});
