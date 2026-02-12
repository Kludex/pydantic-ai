/**
 * EvaluatorContext: the context object passed to evaluators.
 *
 * Contains all information needed to evaluate a task execution.
 */

import { SpanTreeRecordingError } from '../otel/errors.js';
import type { SpanTree } from '../otel/span-tree.js';

export interface EvaluatorContext<TInputs = unknown, TOutput = unknown, TMetadata = unknown> {
  /** The name of the case. */
  name: string | null;
  /** The inputs provided to the task for this case. */
  inputs: TInputs;
  /** Metadata associated with the case. */
  metadata: TMetadata | null;
  /** The expected output for the case. */
  expectedOutput: TOutput | null;
  /** The actual output produced by the task. */
  output: TOutput;
  /** The duration of the task run in seconds. */
  duration: number;
  /** Attributes associated with the task run. */
  attributes: Record<string, unknown>;
  /** Metrics associated with the task run. */
  metrics: Record<string, number>;

  /** Access the span tree. Throws SpanTreeRecordingError if not available. */
  readonly spanTree: SpanTree;
}

/**
 * Create an EvaluatorContext with a span tree or recording error.
 */
export function createEvaluatorContext<TInputs, TOutput, TMetadata>(opts: {
  name: string | null;
  inputs: TInputs;
  metadata: TMetadata | null;
  expectedOutput: TOutput | null;
  output: TOutput;
  duration: number;
  attributes: Record<string, unknown>;
  metrics: Record<string, number>;
  spanTreeOrError: SpanTree | SpanTreeRecordingError;
}): EvaluatorContext<TInputs, TOutput, TMetadata> {
  return {
    name: opts.name,
    inputs: opts.inputs,
    metadata: opts.metadata,
    expectedOutput: opts.expectedOutput,
    output: opts.output,
    duration: opts.duration,
    attributes: opts.attributes,
    metrics: opts.metrics,
    get spanTree(): SpanTree {
      if (opts.spanTreeOrError instanceof SpanTreeRecordingError) {
        throw opts.spanTreeOrError;
      }
      return opts.spanTreeOrError;
    },
  };
}
