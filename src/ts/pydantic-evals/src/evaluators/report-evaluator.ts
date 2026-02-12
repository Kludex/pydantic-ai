/**
 * ReportEvaluator: base class for experiment-wide evaluators.
 *
 * Unlike case-level Evaluators which assess individual task outputs,
 * ReportEvaluators see all case results together and produce
 * experiment-wide analyses like confusion matrices or precision-recall curves.
 */

import type { ReportAnalysis } from '../reporting/analyses.js';
import { BaseEvaluator } from './base.js';

// Forward reference to avoid circular dependency; concrete type in reporting/report.ts
export interface ReportEvaluatorContext<
  _TInputs = unknown,
  _TOutput = unknown,
  _TMetadata = unknown,
> {
  /** The experiment name. */
  name: string;
  /** The full evaluation report. */
  report: unknown; // EvaluationReport — will be typed at call site
  /** Experiment-level metadata. */
  experimentMetadata: Record<string, unknown> | null;
}

export abstract class ReportEvaluator<
  TInputs = unknown,
  TOutput = unknown,
  TMetadata = unknown,
> extends BaseEvaluator {
  /**
   * Evaluate the full report and return experiment-wide analysis/analyses.
   */
  abstract evaluate(
    ctx: ReportEvaluatorContext<TInputs, TOutput, TMetadata>,
  ): ReportAnalysis | ReportAnalysis[] | Promise<ReportAnalysis | ReportAnalysis[]>;
}
