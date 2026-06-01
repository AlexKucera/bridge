import { describe, it, expect } from "vitest";
import { render, screen } from "@solidjs/testing-library";
import { TurnMetricsBar } from "../components/execution/TurnMetricsBar";
import type { TurnMetrics } from "../lib/execution-types";

describe("TurnMetricsBar", () => {
  const baseMetrics: TurnMetrics = {
    tokensUsed: 0,
    costUsd: 0,
    toolCallCount: 0,
    durationMs: 0,
  };

  it("renders tokens used", () => {
    render(() => <TurnMetricsBar metrics={{ ...baseMetrics, tokensUsed: 320 }} />);
    screen.getByText("320");
  });

  it("renders cost in USD with $ prefix", () => {
    render(() => <TurnMetricsBar metrics={{ ...baseMetrics, costUsd: 0.0042 }} />);
    screen.getByText((c) => c.includes("$0.00"));
  });

  it("renders tool call count", () => {
    render(() => <TurnMetricsBar metrics={{ ...baseMetrics, toolCallCount: 5 }} />);
    screen.getByText("5 tools");
  });

  it("renders duration formatted as seconds or minutes", () => {
    render(() => <TurnMetricsBar metrics={{ ...baseMetrics, durationMs: 90123 }} />);
    screen.getByText((c) => c.includes("1:30"));
  });

  it("renders all zero metrics gracefully", () => {
    render(() => <TurnMetricsBar metrics={baseMetrics} />);
    screen.getByText("0");
    screen.getByText("$0.00");
    screen.getByText("0 tools");
  });
});
