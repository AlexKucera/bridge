/// streamingBatch — coalesces rapid delta events into animated frames.
///
/// Batches incoming items (e.g., ThinkingDelta, TextDelta) and flushes
/// them either:
/// - After a time window elapses (default: ~1 frame at 60fps = 16ms)
/// - When the batch reaches a maximum size (prevents memory buildup)
///
/// This prevents layout thrashing during high-frequency event bursts
/// by ensuring DOM updates happen in coordinated batches rather than
/// per-event.

export interface StreamingBatchOptions<T> {
  /** Callback invoked with the batched items. */
  onFlush: (items: T[]) => void;
  /** Time window in ms before auto-flush (default: 16 ≈ 1 frame @ 60fps). */
  windowMs?: number;
  /** Max items before immediate flush (default: 50). */
  maxSize?: number;
}

export interface StreamingBatch<T> {
  /** Add an item to the current batch. */
  push(item: T): void;
  /** Flush remaining items and cancel any pending timer. */
  dispose(): void;
}

/**
 * Create a new streaming batch coalescer.
 *
 * @example
 * ```ts
 * const batch = streamingBatch<string>((items) => {
 *   // Update DOM once with all accumulated deltas
 *   appendText(items.join(""));
 * }, { windowMs: 16, maxSize: 50 });
 *
 * // Rapid events — only 1 DOM update after 16ms
 * batch.push("H");
 * batch.push("e");
 * batch.push("l");
 * batch.push("l");
 * batch.push("o");
 * ```
 */
export function streamingBatch<T>(
  onFlush: (items: T[]) => void,
  options?: Partial<Omit<StreamingBatchOptions<T>, "onFlush">>
): StreamingBatch<T> {
  const windowMs = options?.windowMs ?? 16;
  const maxSize = options?.maxSize ?? 50;

  let buffer: T[] = [];
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function scheduleFlush(): void {
    if (timerId !== null) return;
    timerId = setTimeout(flush, windowMs);
  }

  function flush(): void {
    if (disposed || buffer.length === 0) {
      timerId = null;
      return;
    }
    const items = buffer;
    buffer = [];
    timerId = null;
    onFlush(items);
  }

  function push(item: T): void {
    if (disposed) return;
    buffer.push(item);

    if (buffer.length >= maxSize) {
      // Immediate flush when batch is full — prevents unbounded buffering
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      flush();
    } else {
      scheduleFlush();
    }
  }

  function dispose(): void {
    disposed = true;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    // Flush any remaining items so nothing is lost
    if (buffer.length > 0) {
      const items = buffer;
      buffer = [];
      onFlush(items);
    }
  }

  return { push, dispose };
}
