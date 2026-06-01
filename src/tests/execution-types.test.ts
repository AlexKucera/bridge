import { describe, it, expect } from "vitest";
import {
  LiveState,
  ToolCallStatus,
  TurnMetrics,
  ToolCallViewModel,
  TurnViewModel,
  ExecutionViewModel,
} from "../lib/execution-types";

describe("ExecutionViewModel types", () => {
  it("creates a default ExecutionViewModel with Queued status and empty turns", () => {
    const model: ExecutionViewModel = {
      sessionId: "",
      modelName: "",
      provider: "",
      thinkingLevel: "",
      status: LiveState.Queued,
      startedAt: undefined,
      elapsedMs: 0,
      totalTokens: 0,
      totalCost: 0,
      turns: [],
    };
    expect(model.status).toBe(LiveState.Queued);
    expect(model.turns).toHaveLength(0);
    expect(model.sessionId).toBe("");
  });

  it("represents all LiveState variants", () => {
    const states: LiveState[] = [
      LiveState.Queued,
      LiveState.Starting,
      LiveState.Idle,
      LiveState.Thinking,
      LiveState.RunningTool,
      LiveState.StreamingText,
      LiveState.Done,
      LiveState.Error,
      LiveState.Stopped,
    ];
    expect(states).toHaveLength(9);
  });

  it("represents all ToolCallStatus variants", () => {
    const statuses: ToolCallStatus[] = [
      ToolCallStatus.Invoking,
      ToolCallStatus.Streaming,
      ToolCallStatus.AwaitingResult,
      ToolCallStatus.Completed,
      ToolCallStatus.Failed,
    ];
    expect(statuses).toHaveLength(5);
  });

  it("builds a full TurnViewModel with tool calls and metrics", () => {
    const turn: TurnViewModel = {
      id: 0,
      role: "user",
      promptText: "Hello",
      thinkingText: "",
      responseText: "Hi there!",
      toolCalls: [
        {
          id: "tc-1",
          toolName: "bash",
          target: "/tmp",
          arguments: { command: "ls" },
          status: ToolCallStatus.Completed,
          durationMs: 42,
          resultPreview: "file1.txt\nfile2.txt",
          rawResult: { content: [{ text: "file1.txt\nfile2.txt" }] },
        },
      ],
      metrics: {
        tokensUsed: 150,
        costUsd: 0.002,
        toolCallCount: 1,
        durationMs: 1200,
      },
      isCollapsed: false,
    };
    expect(turn.toolCalls).toHaveLength(1);
    expect(turn.toolCalls[0].status).toBe(ToolCallStatus.Completed);
    expect(turn.metrics.tokensUsed).toBe(150);
  });

  it("builds ExecutionViewModel with empty unknownEvents array by default", () => {
    const model: ExecutionViewModel = {
      sessionId: "",
      modelName: "",
      provider: "",
      thinkingLevel: "",
      status: LiveState.Queued,
      elapsedMs: 0,
      totalTokens: 0,
      totalCost: 0,
      turns: [],
      unknownEvents: [],
    };
    expect(model.unknownEvents).toEqual([]);
  });

  it("builds a complete ExecutionViewModel with session data and multiple turns", () => {
    const model: ExecutionViewModel = {
      sessionId: "sess-abc",
      modelName: "claude-sonnet-4",
      provider: "anthropic",
      thinkingLevel: "medium",
      status: LiveState.Done,
      startedAt: "2026-06-01T06:00:00Z",
      elapsedMs: 5000,
      totalTokens: 320,
      totalCost: 0.004,
      turns: [
        {
          id: 0,
          role: "user",
          promptText: "Say hi",
          thinkingText: "hmm",
          responseText: "Hello!",
          toolCalls: [],
          metrics: { tokensUsed: 320, costUsd: 0.004, toolCallCount: 0, durationMs: 1200 },
          isCollapsed: false,
        },
      ],
    };
    expect(model.sessionId).toBe("sess-abc");
    expect(model.status).toBe(LiveState.Done);
    expect(model.turns[0].responseText).toBe("Hello!");
  });
});
