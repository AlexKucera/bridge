import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { SessionHeader } from "../components/execution/SessionHeader";
import { LiveState } from "../lib/execution-types";

describe("SessionHeader", () => {
  it("renders model name and provider", () => {
    render(() => (
      <SessionHeader
        modelName="claude-sonnet-4"
        provider="anthropic"
        thinkingLevel="medium"
        status={LiveState.Idle}
        elapsedMs={0}
      />
    ));
    screen.getByText("claude-sonnet-4");
    screen.getByText("anthropic");
  });

  it("renders status badge with status text", () => {
    render(() => (
      <SessionHeader
        modelName="gpt-4o"
        provider="openai"
        thinkingLevel="high"
        status={LiveState.Thinking}
        elapsedMs={1200}
      />
    ));
    screen.getByText("Thinking");
  });

  it("formats elapsed time as mm:ss", () => {
    render(() => (
      <SessionHeader
        modelName="gpt-4o"
        provider="openai"
        thinkingLevel="low"
        status={LiveState.StreamingText}
        elapsedMs={65432}
      />
    ));
    screen.getByText((content) => content.includes("01:05"));
  });

  it("renders thinking level indicator", () => {
    render(() => (
      <SessionHeader
        modelName="gpt-4o"
        provider="openai"
        thinkingLevel="medium"
        status={LiveState.Done}
        elapsedMs={5000}
      />
    ));
    screen.getByText(/medium/i);
  });
});
