/**
 * In-memory OTel span exporter with context tracking.
 *
 * Uses AsyncLocalStorage to associate exported spans with the current evaluation context.
 * This is an optional module that requires @opentelemetry/sdk-trace-base.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

// We dynamically import OTel types to keep them optional
type ReadableSpan = {
  name: string;
  spanContext(): { traceId: string; spanId: string };
  parentSpanId?: string;
  startTime: [number, number]; // [seconds, nanoseconds]
  endTime: [number, number];
  attributes: Record<string, unknown>;
};

const contextIdStorage = new AsyncLocalStorage<string>();

interface SpanRecord {
  name: string;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  startTime: [number, number];
  endTime: [number, number];
  attributes: Record<string, unknown>;
}

/**
 * In-memory span exporter that groups spans by context ID.
 */
export class ContextInMemorySpanExporter {
  private finishedSpans: Map<string, SpanRecord[]> = new Map();
  private stopped = false;

  clear(contextId?: string): void {
    if (contextId === undefined) {
      this.finishedSpans.clear();
    } else {
      this.finishedSpans.delete(contextId);
    }
  }

  getFinishedSpans(contextId?: string): SpanRecord[] {
    if (contextId === undefined) {
      const all: SpanRecord[] = [];
      for (const spans of this.finishedSpans.values()) {
        all.push(...spans);
      }
      return all;
    }
    return this.finishedSpans.get(contextId) ?? [];
  }

  export(spans: ReadableSpan[]): void {
    if (this.stopped) return;

    const contextId = contextIdStorage.getStore();
    if (contextId === undefined) return;

    let list = this.finishedSpans.get(contextId);
    if (!list) {
      list = [];
      this.finishedSpans.set(contextId, list);
    }

    for (const span of spans) {
      list.push({
        name: span.name,
        traceId: span.spanContext().traceId,
        spanId: span.spanContext().spanId,
        parentSpanId: span.parentSpanId ?? null,
        startTime: span.startTime,
        endTime: span.endTime,
        attributes: { ...span.attributes },
      });
    }
  }

  shutdown(): void {
    this.stopped = true;
  }
}

/**
 * Run a function within a new context ID scope.
 * Spans exported during this scope will be associated with the generated context ID.
 */
export async function withContextId<T>(
  fn: () => Promise<T>,
): Promise<{ contextId: string; result: T }> {
  const contextId = randomUUID();
  const result = await contextIdStorage.run(contextId, fn);
  return { contextId, result };
}

export { contextIdStorage };
