/**
 * Span capture during task execution.
 *
 * Provides a function that captures spans created during a task execution
 * and returns them as a SpanTree.
 *
 * This is a simplified version since OTel integration is optional in the TS port.
 * In practice, users would need to configure an OTel SDK and register the exporter.
 */

import { SpanTreeRecordingError } from './errors.js';
import { SpanNode, SpanTree } from './span-tree.js';

/**
 * Run a function and attempt to capture spans created during its execution.
 *
 * Returns the function's result and either a SpanTree or a SpanTreeRecordingError.
 *
 * For full OTel integration, users should configure the OTel SDK and use
 * ContextInMemorySpanExporter. This simplified version creates an empty SpanTree
 * or a recording error.
 */
export async function withSpanCapture<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; spanTree: SpanTree | SpanTreeRecordingError }> {
  // Try to use OTel if available
  try {
    // Dynamic import to keep OTel optional
    const otelApi = await import('@opentelemetry/api');
    const provider = otelApi.trace.getTracerProvider();

    // Check if a real tracer provider is configured
    if (!provider || !('addSpanProcessor' in provider)) {
      return {
        result: await fn(),
        spanTree: new SpanTreeRecordingError(
          'To make use of the span tree in an evaluator, you must configure an OpenTelemetry tracer provider ' +
            'before running an evaluation.',
        ),
      };
    }

    // If OTel is configured, run the function with an empty tree
    // (The actual span collection requires ContextInMemorySpanExporter to be registered)
    const result = await fn();
    return { result, spanTree: new SpanTree() };
  } catch {
    // OTel not installed — return recording error
    const result = await fn();
    return {
      result,
      spanTree: new SpanTreeRecordingError(
        'To make use of the span tree in an evaluator, you must install ' +
          '@opentelemetry/api and @opentelemetry/sdk-trace-base.',
      ),
    };
  }
}

/**
 * Create SpanNodes from raw span records (from ContextInMemorySpanExporter).
 */
export function spanNodesFromRecords(
  records: Array<{
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId: string | null;
    startTime: [number, number];
    endTime: [number, number];
    attributes: Record<string, unknown>;
  }>,
): SpanNode[] {
  return records.map(
    (r) =>
      new SpanNode({
        name: r.name,
        traceId: r.traceId,
        spanId: r.spanId,
        parentSpanId: r.parentSpanId,
        startTimestamp: hrtimeToDate(r.startTime),
        endTimestamp: hrtimeToDate(r.endTime),
        attributes: r.attributes as Record<string, string | boolean | number>,
      }),
  );
}

function hrtimeToDate(hrtime: [number, number]): Date {
  return new Date(hrtime[0] * 1000 + hrtime[1] / 1_000_000);
}
