/**
 * Built-in report evaluators: ConfusionMatrixEvaluator, PrecisionRecallEvaluator.
 */

import type {
  ConfusionMatrix,
  PrecisionRecall,
  PrecisionRecallCurve,
  PrecisionRecallPoint,
} from '../reporting/analyses.js';
import type { ReportCase } from '../reporting/report.js';
import { ReportEvaluator, type ReportEvaluatorContext } from './report-evaluator.js';

/**
 * Computes a confusion matrix from case data.
 */
export class ConfusionMatrixEvaluator extends ReportEvaluator {
  readonly predictedFrom: 'expected_output' | 'output' | 'metadata' | 'labels';
  readonly predictedKey: string | null;
  readonly expectedFrom: 'expected_output' | 'output' | 'metadata' | 'labels';
  readonly expectedKey: string | null;
  readonly title: string;

  constructor(opts?: {
    predictedFrom?: 'expected_output' | 'output' | 'metadata' | 'labels';
    predictedKey?: string | null;
    expectedFrom?: 'expected_output' | 'output' | 'metadata' | 'labels';
    expectedKey?: string | null;
    title?: string;
  }) {
    super();
    this.predictedFrom = opts?.predictedFrom ?? 'output';
    this.predictedKey = opts?.predictedKey ?? null;
    this.expectedFrom = opts?.expectedFrom ?? 'expected_output';
    this.expectedKey = opts?.expectedKey ?? null;
    this.title = opts?.title ?? 'Confusion Matrix';
  }

  protected getFields() {
    return {
      predictedFrom: this.predictedFrom,
      predictedKey: this.predictedKey,
      expectedFrom: this.expectedFrom,
      expectedKey: this.expectedKey,
      title: this.title,
    };
  }
  protected getDefaults() {
    return {
      predictedFrom: 'output',
      predictedKey: null,
      expectedFrom: 'expected_output',
      expectedKey: null,
      title: 'Confusion Matrix',
    };
  }

  evaluate(ctx: ReportEvaluatorContext): ConfusionMatrix {
    const report = ctx.report as { cases: ReportCase[] };
    const predicted: string[] = [];
    const expected: string[] = [];

    for (const c of report.cases) {
      const pred = extractValue(c, this.predictedFrom, this.predictedKey);
      const exp = extractValue(c, this.expectedFrom, this.expectedKey);
      if (pred === null || exp === null) continue;
      predicted.push(pred);
      expected.push(exp);
    }

    const allLabels = [...new Set([...predicted, ...expected])].sort();
    const labelToIdx = new Map(allLabels.map((label, i) => [label, i]));
    const matrix = allLabels.map(() => allLabels.map(() => 0));

    for (let i = 0; i < expected.length; i++) {
      const ei = labelToIdx.get(expected[i]!)!;
      const pi = labelToIdx.get(predicted[i]!)!;
      matrix[ei]![pi]! += 1;
    }

    return {
      type: 'confusion_matrix',
      title: this.title,
      classLabels: allLabels,
      matrix,
    };
  }
}

/**
 * Computes a precision-recall curve from case data.
 */
export class PrecisionRecallEvaluator extends ReportEvaluator {
  readonly scoreKey: string;
  readonly positiveFrom: 'expected_output' | 'assertions' | 'labels';
  readonly positiveKey: string | null;
  readonly scoreFrom: 'scores' | 'metrics';
  readonly title: string;
  readonly nThresholds: number;

  constructor(opts: {
    scoreKey: string;
    positiveFrom: 'expected_output' | 'assertions' | 'labels';
    positiveKey?: string | null;
    scoreFrom?: 'scores' | 'metrics';
    title?: string;
    nThresholds?: number;
  }) {
    super();
    this.scoreKey = opts.scoreKey;
    this.positiveFrom = opts.positiveFrom;
    this.positiveKey = opts.positiveKey ?? null;
    this.scoreFrom = opts.scoreFrom ?? 'scores';
    this.title = opts.title ?? 'Precision-Recall Curve';
    this.nThresholds = opts.nThresholds ?? 100;
  }

  protected getFields() {
    return {
      scoreKey: this.scoreKey,
      positiveFrom: this.positiveFrom,
      positiveKey: this.positiveKey,
      scoreFrom: this.scoreFrom,
      title: this.title,
      nThresholds: this.nThresholds,
    };
  }
  protected getDefaults() {
    return {
      positiveKey: null,
      scoreFrom: 'scores',
      title: 'Precision-Recall Curve',
      nThresholds: 100,
    };
  }

  evaluate(ctx: ReportEvaluatorContext): PrecisionRecall {
    const report = ctx.report as { cases: ReportCase[] };
    const scoredCases: [number, boolean][] = [];

    for (const c of report.cases) {
      const score = this.getScore(c);
      const isPositive = this.getPositive(c);
      if (score === null || isPositive === null) continue;
      scoredCases.push([score, isPositive]);
    }

    scoredCases.sort((a, b) => b[0] - a[0]);

    if (scoredCases.length === 0) {
      return { type: 'precision_recall', title: this.title, curves: [] };
    }

    const scores = scoredCases.map(([s]) => s);
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    let thresholds: number[];
    if (minScore === maxScore) {
      thresholds = [minScore];
    } else {
      const step = (maxScore - minScore) / this.nThresholds;
      thresholds = Array.from({ length: this.nThresholds + 1 }, (_, i) => minScore + i * step);
    }

    const points: PrecisionRecallPoint[] = [];
    for (const threshold of thresholds) {
      let tp = 0,
        fp = 0,
        fn = 0;
      for (const [s, p] of scoredCases) {
        if (s >= threshold && p) tp++;
        if (s >= threshold && !p) fp++;
        if (s < threshold && p) fn++;
      }
      const precision = tp + fp > 0 ? tp / (tp + fp) : 1.0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0.0;
      points.push({ threshold, precision, recall });
    }

    // Compute AUC using trapezoidal rule
    let auc = 0;
    for (let i = 1; i < points.length; i++) {
      auc +=
        (Math.abs(points[i]!.recall - points[i - 1]!.recall) *
          (points[i]!.precision + points[i - 1]!.precision)) /
        2;
    }

    const curve: PrecisionRecallCurve = { name: ctx.name, points, auc };
    return { type: 'precision_recall', title: this.title, curves: [curve] };
  }

  private getScore(c: ReportCase): number | null {
    if (this.scoreFrom === 'scores') {
      const result = c.scores[this.scoreKey];
      return result ? Number(result.value) : null;
    }
    const val = c.metrics[this.scoreKey];
    return val !== undefined ? Number(val) : null;
  }

  private getPositive(c: ReportCase): boolean | null {
    if (this.positiveFrom === 'expected_output') {
      return c.expectedOutput != null ? Boolean(c.expectedOutput) : null;
    }
    if (this.positiveFrom === 'assertions') {
      if (!this.positiveKey) {
        throw new Error("'positiveKey' is required when positiveFrom='assertions'");
      }
      const assertion = c.assertions[this.positiveKey];
      return assertion ? assertion.value : null;
    }
    if (this.positiveFrom === 'labels') {
      if (!this.positiveKey) {
        throw new Error("'positiveKey' is required when positiveFrom='labels'");
      }
      const label = c.labels[this.positiveKey];
      return label ? Boolean(label.value) : null;
    }
    /* v8 ignore next */
    throw new Error(`Unknown positiveFrom: ${this.positiveFrom as string}`);
  }
}

/** Default report evaluator types for the registry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DEFAULT_REPORT_EVALUATORS: (new (...args: any[]) => ReportEvaluator)[] = [
  ConfusionMatrixEvaluator,
  PrecisionRecallEvaluator,
];

// -- Helpers --

function extractValue(
  c: ReportCase,
  from: 'expected_output' | 'output' | 'metadata' | 'labels',
  key: string | null,
): string | null {
  if (from === 'expected_output') {
    return c.expectedOutput != null ? String(c.expectedOutput) : null;
  }
  if (from === 'output') {
    return c.output != null ? String(c.output) : null;
  }
  if (from === 'metadata') {
    if (key != null) {
      if (typeof c.metadata === 'object' && c.metadata !== null) {
        const val = (c.metadata as Record<string, unknown>)[key];
        return val != null ? String(val) : null;
      }
      return null;
    }
    return c.metadata != null ? String(c.metadata) : null;
  }
  if (from === 'labels') {
    if (!key) {
      throw new Error("'key' is required when from='labels'");
    }
    const label = c.labels[key];
    return label ? String(label.value) : null;
  }
  /* v8 ignore next 2 */
  throw new Error(`Unknown from: ${from as string}`);
}
