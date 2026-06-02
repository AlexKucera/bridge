import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamingBatch } from "../lib/streaming-batch";

describe("streamingBatch", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("batches rapid calls into a single flush within window", () => {
    const onFlush = vi.fn();
    const batch = streamingBatch<string>(onFlush, { windowMs: 100 });

    batch.push("a");
    batch.push("b");
    batch.push("c");

    // Should not have flushed yet (within window)
    expect(onFlush).not.toHaveBeenCalled();

    // Advance past the window
    vi.advanceTimersByTime(110);

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("flushes immediately when batch reaches maxSize", () => {
    const onFlush = vi.fn();
    const batch = streamingBatch<string>(onFlush, { windowMs: 200, maxSize: 3 });

    batch.push("a");
    batch.push("b");
    expect(onFlush).not.toHaveBeenCalled();

    // Third push hits maxSize → immediate flush
    batch.push("c");
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("resets after flush and starts a new batch", () => {
    const onFlush = vi.fn();
    const batch = streamingBatch<number>(onFlush, { windowMs: 100 });

    batch.push(1);
    vi.advanceTimersByTime(110);
    expect(onFlush).toHaveBeenCalledWith([1]);

    batch.push(2);
    batch.push(3);
    vi.advanceTimersByTime(110);
    expect(onFlush).toHaveBeenLastCalledWith([2, 3]);
    expect(onFlush).toHaveBeenCalledTimes(2);
  });

  it("handles empty batch gracefully on dispose", () => {
    const onFlush = vi.fn();
    const batch = streamingBatch<string>(onFlush, { windowMs: 100 });
    batch.dispose();
    // No flush for empty batch
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("flushes remaining items on dispose", () => {
    const onFlush = vi.fn();
    const batch = streamingBatch<string>(onFlush, { windowMs: 5000 });

    batch.push("x");
    batch.push("y");

    batch.dispose();

    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith(["x", "y"]);
  });

  it("uses requestAnimationFrame-like scheduling by default", () => {
    const onFlush = vi.fn();
    const batch = streamingBatch<string>(onFlush);

    batch.push("raf-test");
    // With fake timers, rAF won't auto-fire; we test via dispose
    batch.dispose();
    expect(onFlush).toHaveBeenCalledTimes(1);
  });
});
