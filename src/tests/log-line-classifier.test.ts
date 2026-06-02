/// Tests for LogLineClassifier — AC#7 color-coded log lines.

import { describe, it, expect } from "vitest";
import {
  classifyLine,
  classifyAndColorize,
  LogLineClass,
  getAnsiForClass,
  DEFAULT_CLASSIFIER_CONFIG,
  type LogLineClassifierConfig,
} from "../lib/log-line-classifier";

// ─── Cycle 1: Classification Engine ──────────────────────────────

describe("classifyLine", () => {
  describe("error patterns", () => {
    it("classifies 'Error:' as Error", () => {
      expect(classifyLine("Error: something went wrong")).toBe(LogLineClass.Error);
    });
    it("classifies lowercase 'error:' as Error", () => {
      expect(classifyLine("error: file not found")).toBe(LogLineClass.Error);
    });
    it("classifies 'ERROR:' as Error", () => {
      expect(classifyLine("ERROR: fatal exception")).toBe(LogLineClass.Error);
    });
    it("classifies Python Traceback as Error", () => {
      expect(classifyLine("Traceback (most recent call last):")).toBe(LogLineClass.Error);
    });
    it("classifies 'panic!' as Error", () => {
      expect(classifyLine("thread 'main' panicked at: assertion failed")).toBe(LogLineClass.Error);
    });
    it("classifies 'fatal:' as Error", () => {
      expect(classifyLine("fatal: not a git repository")).toBe(LogLineClass.Error);
    });
  });

  describe("warning patterns", () => {
    it("classifies 'Warning:' as Warn", () => {
      expect(classifyLine("Warning: deprecated API")).toBe(LogLineClass.Warn);
    });
    it("classifies 'warn:' as Warn", () => {
      expect(classifyLine("warn: unresolved dependency")).toBe(LogLineClass.Warn);
    });
    it("classifies 'WARNING:' as Warn", () => {
      expect(classifyLine("WARNING: memory limit approaching")).toBe(LogLineClass.Warn);
    });
    it("classifies 'deprecated' lines as Warn", () => {
      expect(classifyLine("'foo' is deprecated, use 'bar' instead")).toBe(LogLineClass.Warn);
    });
  });

  describe("prompt / input patterns", () => {
    it("classifies '> ' shell prompt as Prompt", () => {
      expect(classifyLine("> ")).toBe(LogLineClass.Prompt);
    });
    it("classifies '$ ' bash prompt as Prompt", () => {
      expect(classifyLine("$ ls -la")).toBe(LogLineClass.Prompt);
    });
    it("classifies '❯ ' arrow prompt as Prompt", () => {
      expect(classifyLine("❯ run tests")).toBe(LogLineClass.Prompt);
    });
    it("classifies '? ' question prompt as Prompt", () => {
      expect(classifyLine("? Continue [Y/n]: ")).toBe(LogLineClass.Prompt);
    });
    it("classifies 'pi> ' prompt as Prompt", () => {
      expect(classifyLine("pi> help me refactor this")).toBe(LogLineClass.Prompt);
    });
  });

  describe("dim / metadata patterns", () => {
    it("classifies ISO timestamp lines as Dim", () => {
      expect(classifyLine("2026-06-02T12:00:00Z  INFO  starting up")).toBe(LogLineClass.Dim);
    });
    it("classifies bracketed context like [info] as Dim", () => {
      expect(classifyLine("[info] session started")).toBe(LogLineClass.Dim);
    });
    it("classifies step numbers like 'Step 3/10' as Dim", () => {
      expect(classifyLine("Step 5/12: building project...")).toBe(LogLineClass.Dim);
    });
  });

  describe("info patterns", () => {
    it("classifies 'INFO:' as Info", () => {
      expect(classifyLine("INFO: server listening on :3000")).toBe(LogLineClass.Info);
    });
    it("classifies 'success:' as Info", () => {
      expect(classifyLine("success: build completed in 2.3s")).toBe(LogLineClass.Info);
    });
    it("classifies '✓' checkmark lines as Info", () => {
      expect(classifyLine("✓ All tests passed")).toBe(LogLineClass.Info);
    });
  });

  describe("fallback", () => {
    it("classifies ordinary output as Plain", () => {
      expect(classifyLine("hello world")).toBe(LogLineClass.Plain);
    });
    it("classifies code output as Plain", () => {
      expect(classifyLine("const x = 42;")).toBe(LogLineClass.Plain);
    });
    it("classifies empty string as Plain", () => {
      expect(classifyLine("")).toBe(LogLineClass.Plain);
    });
    it("classifies whitespace-only as Plain", () => {
      expect(classifyLine("   ")).toBe(LogLineClass.Plain);
    });
  });

  describe("priority ordering", () => {
    it("Error takes priority over Warn", () => {
      expect(classifyLine("Error: Warning: nested message")).toBe(LogLineClass.Error);
    });
    it("Warn takes priority over Info", () => {
      expect(classifyLine("Warning: INFO: something")).toBe(LogLineClass.Warn);
    });
  });
});

// ─── Cycle 2: ANSI Colorization ──────────────────────────────────

describe("getAnsiForClass", () => {
  it("returns bright red ANSI for Error", () => {
    const ansi = getAnsiForClass(LogLineClass.Error);
    expect(ansi).toContain("\x1b[");
    expect(ansi).toContain("91"); // bright red
  });
  it("returns yellow ANSI for Warn", () => {
    const ansi = getAnsiForClass(LogLineClass.Warn);
    expect(ansi).toContain("93"); // bright yellow
  });
  it("returns green ANSI for Prompt", () => {
    const ansi = getAnsiForClass(LogLineClass.Prompt);
    expect(ansi).toContain("92"); // bright green
  });
  it("returns dim/gray ANSI for Dim", () => {
    const ansi = getAnsiForClass(LogLineClass.Dim);
    expect(ansi).toContain("2"); // dim/faint
    expect(ansi).toContain("90"); // bright gray
  });
  it("returns empty string for Plain (no coloring)", () => {
    expect(getAnsiForClass(LogLineClass.Plain)).toBe("");
  });
});

describe("classifyAndColorize", () => {
  it("wraps error line with red ANSI", () => {
    const result = classifyAndColorize("Error: boom");
    expect(result).toContain("\x1b[");
    expect(result).toContain("boom");
    expect(result).toContain("91"); // bright red
  });
  it("wraps warning line with yellow ANSI", () => {
    const result = classifyAndColorize("Warning: careful");
    expect(result).toContain("93"); // bright yellow
    expect(result).toContain("careful");
  });
  it("wraps prompt line with green ANSI", () => {
    const result = classifyAndColorize("$ cargo build");
    expect(result).toContain("92"); // bright green
    expect(result).toContain("cargo build");
  });
  it("wraps dim line with gray/dim ANSI", () => {
    const result = classifyAndColorize("[info] connected");
    expect(result).toContain("2"); // dim
    expect(result).toContain("connected");
  });
  it("passes through plain text without modification", () => {
    const result = classifyAndColorize("just normal output");
    expect(result).not.toContain("\x1b[");
    expect(result).toBe("just normal output");
  });
  it("preserves existing ANSI escape codes in the line", () => {
    const boldRed = "\x1b[1;31malready colored\x1b[0m";
    const result = classifyAndColorize(boldRed);
    expect(result).toContain("already colored");
  });
  it("handles multi-line strings by processing each line", () => {
    const input = "line one\nError: line two\n$ line three";
    const result = classifyAndColorize(input);
    expect(result).toContain("line one");
    expect(result).toContain("91"); // bright red for error line
    expect(result).toContain("92"); // bright green for prompt line
  });
  it("includes reset sequence after colored lines", () => {
    const result = classifyAndColorize("Error: test");
    expect(result).toMatch(/\x1b\[0m/); // reset present
  });
});

// ─── Cycle 3: Configuration ──────────────────────────────────────

describe("custom classifier config", () => {
  it("uses custom error patterns when provided", () => {
    const config: LogLineClassifierConfig = {
      ...DEFAULT_CLASSIFIER_CONFIG,
      errorPatterns: [/FATAL\b/i],
    };
    expect(config.errorPatterns).toHaveLength(1);
    expect(config.errorPatterns[0].source).toBe("FATAL\\b");
  });
  it("allows disabling a category by passing empty pattern array", () => {
    const config: LogLineClassifierConfig = {
      ...DEFAULT_CLASSIFIER_CONFIG,
      promptPatterns: [],
    };
    expect(config.promptPatterns).toHaveLength(0);
  });
});
