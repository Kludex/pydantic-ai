import { describe, expect, it } from 'vitest';
import {
  ConfusionMatrixEvaluator,
  PrecisionRecallEvaluator,
} from '../src/evaluators/report-common.js';
import type { ReportEvaluatorContext } from '../src/evaluators/report-evaluator.js';
import type { ReportCase } from '../src/reporting/report.js';
import { createReportCase } from '../src/reporting/report.js';

function makeReportCase(
  name: string,
  output: unknown,
  expectedOutput: unknown,
  overrides?: {
    metadata?: unknown;
    scores?: Record<
      string,
      { name: string; value: number; reason: null; source: { name: string; arguments: null } }
    >;
    assertions?: Record<
      string,
      { name: string; value: boolean; reason: null; source: { name: string; arguments: null } }
    >;
    labels?: Record<
      string,
      { name: string; value: string; reason: null; source: { name: string; arguments: null } }
    >;
  },
): ReportCase {
  return createReportCase({
    name,
    inputs: 'input',
    metadata: overrides?.metadata ?? null,
    expectedOutput,
    output,
    metrics: {},
    attributes: {},
    scores: overrides?.scores ?? {},
    labels: overrides?.labels ?? {},
    assertions: overrides?.assertions ?? {},
    taskDuration: 1.0,
    totalDuration: 1.5,
    sourceCaseName: null,
  });
}

function makeCtx(cases: ReportCase[], name = 'test'): ReportEvaluatorContext {
  return {
    name,
    report: { cases },
    experimentMetadata: null,
  };
}

describe('ConfusionMatrixEvaluator', () => {
  it('computes confusion matrix from output vs expected_output', () => {
    const cases = [
      makeReportCase('a', 'cat', 'cat'),
      makeReportCase('b', 'dog', 'cat'),
      makeReportCase('c', 'cat', 'dog'),
      makeReportCase('d', 'dog', 'dog'),
    ];
    const ev = new ConfusionMatrixEvaluator();
    const result = ev.evaluate(makeCtx(cases));

    expect(result.type).toBe('confusion_matrix');
    expect(result.title).toBe('Confusion Matrix');
    expect(result.classLabels).toEqual(['cat', 'dog']);
    // matrix[expected][predicted]
    // cat->cat: 1, cat->dog: 1, dog->cat: 1, dog->dog: 1
    expect(result.matrix).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  it('skips cases with null output', () => {
    const cases = [makeReportCase('a', null, 'cat'), makeReportCase('b', 'dog', 'dog')];
    const ev = new ConfusionMatrixEvaluator();
    const result = ev.evaluate(makeCtx(cases));
    expect(result.classLabels).toEqual(['dog']);
    expect(result.matrix).toEqual([[1]]);
  });

  it('skips cases with null expected_output', () => {
    const cases = [makeReportCase('a', 'cat', null), makeReportCase('b', 'dog', 'dog')];
    const ev = new ConfusionMatrixEvaluator();
    const result = ev.evaluate(makeCtx(cases));
    expect(result.classLabels).toEqual(['dog']);
  });

  it('uses metadata for extraction', () => {
    const cases = [
      makeReportCase('a', 'ignored', 'ignored', { metadata: { pred: 'cat', truth: 'cat' } }),
      makeReportCase('b', 'ignored', 'ignored', { metadata: { pred: 'dog', truth: 'cat' } }),
    ];
    const ev = new ConfusionMatrixEvaluator({
      predictedFrom: 'metadata',
      predictedKey: 'pred',
      expectedFrom: 'metadata',
      expectedKey: 'truth',
    });
    const result = ev.evaluate(makeCtx(cases));
    expect(result.classLabels).toContain('cat');
    expect(result.classLabels).toContain('dog');
  });

  it('uses labels for extraction', () => {
    const spec = { name: 'L', arguments: null };
    const cases = [
      makeReportCase('a', 'x', 'x', {
        labels: {
          pred: { name: 'pred', value: 'cat', reason: null, source: spec },
          truth: { name: 'truth', value: 'cat', reason: null, source: spec },
        },
      }),
    ];
    const ev = new ConfusionMatrixEvaluator({
      predictedFrom: 'labels',
      predictedKey: 'pred',
      expectedFrom: 'labels',
      expectedKey: 'truth',
    });
    const result = ev.evaluate(makeCtx(cases));
    expect(result.classLabels).toEqual(['cat']);
  });

  it('handles metadata without key', () => {
    const cases = [makeReportCase('a', 'x', 'x', { metadata: 'simple' })];
    const ev = new ConfusionMatrixEvaluator({ predictedFrom: 'metadata' });
    const result = ev.evaluate(makeCtx(cases));
    expect(result.classLabels).toContain('simple');
  });

  it('returns null for metadata key on non-object metadata', () => {
    const cases = [makeReportCase('a', 'x', 'x', { metadata: 'not-an-object' })];
    const ev = new ConfusionMatrixEvaluator({
      predictedFrom: 'metadata',
      predictedKey: 'field',
    });
    const result = ev.evaluate(makeCtx(cases));
    // Both predicted (metadata key on non-object) returns null, so case is skipped
    expect(result.classLabels).toEqual([]);
  });

  it('throws for labels without key', () => {
    const cases = [makeReportCase('a', 'x', 'x')];
    const ev = new ConfusionMatrixEvaluator({ predictedFrom: 'labels' });
    expect(() => ev.evaluate(makeCtx(cases))).toThrow("'key' is required");
  });

  it('handles missing metadata key on object metadata', () => {
    const cases = [makeReportCase('a', 'x', 'y', { metadata: { other: 'val' } })];
    const ev = new ConfusionMatrixEvaluator({
      predictedFrom: 'metadata',
      predictedKey: 'missing',
    });
    const result = ev.evaluate(makeCtx(cases));
    // predicted returns null, so case is skipped
    expect(result.classLabels).toEqual([]);
  });

  it('handles missing label key', () => {
    const cases = [makeReportCase('a', 'x', 'y')];
    const ev = new ConfusionMatrixEvaluator({
      predictedFrom: 'labels',
      predictedKey: 'nonexistent',
    });
    const result = ev.evaluate(makeCtx(cases));
    expect(result.classLabels).toEqual([]);
  });

  it('serializes to spec', () => {
    const ev = new ConfusionMatrixEvaluator();
    const spec = ev.asSpec();
    expect(spec.name).toBe('ConfusionMatrixEvaluator');
    expect(spec.arguments).toBeNull();
  });

  it('serializes with custom title', () => {
    const ev = new ConfusionMatrixEvaluator({ title: 'Custom' });
    const spec = ev.asSpec();
    expect(spec.arguments).toEqual({ title: 'Custom' });
  });
});

describe('PrecisionRecallEvaluator', () => {
  it('computes precision-recall curve', () => {
    const spec = { name: 'S', arguments: null };
    const cases = [
      makeReportCase('a', 'x', true, {
        scores: { confidence: { name: 'confidence', value: 0.9, reason: null, source: spec } },
      }),
      makeReportCase('b', 'x', true, {
        scores: { confidence: { name: 'confidence', value: 0.7, reason: null, source: spec } },
      }),
      makeReportCase('c', 'x', false, {
        scores: { confidence: { name: 'confidence', value: 0.5, reason: null, source: spec } },
      }),
      makeReportCase('d', 'x', false, {
        scores: { confidence: { name: 'confidence', value: 0.3, reason: null, source: spec } },
      }),
    ];

    const ev = new PrecisionRecallEvaluator({
      scoreKey: 'confidence',
      positiveFrom: 'expected_output',
      nThresholds: 10,
    });
    const result = ev.evaluate(makeCtx(cases));

    expect(result.type).toBe('precision_recall');
    expect(result.curves).toHaveLength(1);
    expect(result.curves[0]!.points.length).toBeGreaterThan(0);
    expect(result.curves[0]!.auc).toBeGreaterThan(0);
  });

  it('returns empty curves for no valid data', () => {
    const ev = new PrecisionRecallEvaluator({
      scoreKey: 'nonexistent',
      positiveFrom: 'expected_output',
    });
    const result = ev.evaluate(makeCtx([]));
    expect(result.curves).toEqual([]);
  });

  it('handles single-score case', () => {
    const spec = { name: 'S', arguments: null };
    const cases = [
      makeReportCase('a', 'x', true, {
        scores: { s: { name: 's', value: 0.5, reason: null, source: spec } },
      }),
    ];
    const ev = new PrecisionRecallEvaluator({
      scoreKey: 's',
      positiveFrom: 'expected_output',
    });
    const result = ev.evaluate(makeCtx(cases));
    expect(result.curves).toHaveLength(1);
    // Single score means min === max, so only one threshold
    expect(result.curves[0]!.points).toHaveLength(1);
  });

  it('uses assertions as positive source', () => {
    const spec = { name: 'S', arguments: null };
    const aSpec = { name: 'A', arguments: null };
    const cases = [
      makeReportCase('a', 'x', 'x', {
        scores: { s: { name: 's', value: 0.9, reason: null, source: spec } },
        assertions: { correct: { name: 'correct', value: true, reason: null, source: aSpec } },
      }),
    ];
    const ev = new PrecisionRecallEvaluator({
      scoreKey: 's',
      positiveFrom: 'assertions',
      positiveKey: 'correct',
    });
    const result = ev.evaluate(makeCtx(cases));
    expect(result.curves).toHaveLength(1);
  });

  it('throws when assertions used without positiveKey', () => {
    const ev = new PrecisionRecallEvaluator({
      scoreKey: 's',
      positiveFrom: 'assertions',
    });
    expect(() => ev.evaluate(makeCtx([makeReportCase('a', 'x', 'x')]))).toThrow(
      "'positiveKey' is required",
    );
  });

  it('uses labels as positive source', () => {
    const spec = { name: 'S', arguments: null };
    const lSpec = { name: 'L', arguments: null };
    const cases = [
      makeReportCase('a', 'x', 'x', {
        scores: { s: { name: 's', value: 0.9, reason: null, source: spec } },
        labels: { is_pos: { name: 'is_pos', value: 'true', reason: null, source: lSpec } },
      }),
    ];
    const ev = new PrecisionRecallEvaluator({
      scoreKey: 's',
      positiveFrom: 'labels',
      positiveKey: 'is_pos',
    });
    const result = ev.evaluate(makeCtx(cases));
    expect(result.curves).toHaveLength(1);
  });

  it('throws when labels used without positiveKey', () => {
    const ev = new PrecisionRecallEvaluator({
      scoreKey: 's',
      positiveFrom: 'labels',
    });
    expect(() => ev.evaluate(makeCtx([makeReportCase('a', 'x', 'x')]))).toThrow(
      "'positiveKey' is required",
    );
  });

  it('uses metrics as score source', () => {
    const cases = [makeReportCase('a', 'x', true)];
    // Inject metric
    (cases[0] as any).metrics = { my_metric: 0.8 };

    const ev = new PrecisionRecallEvaluator({
      scoreKey: 'my_metric',
      positiveFrom: 'expected_output',
      scoreFrom: 'metrics',
    });
    const result = ev.evaluate(makeCtx(cases));
    expect(result.curves).toHaveLength(1);
  });

  it('serializes to spec', () => {
    const ev = new PrecisionRecallEvaluator({
      scoreKey: 'accuracy',
      positiveFrom: 'expected_output',
    });
    const spec = ev.asSpec();
    expect(spec.name).toBe('PrecisionRecallEvaluator');
    expect(spec.arguments).toEqual({
      scoreKey: 'accuracy',
      positiveFrom: 'expected_output',
    });
  });

  it('includes experiment name in curve', () => {
    const spec = { name: 'S', arguments: null };
    const cases = [
      makeReportCase('a', 'x', true, {
        scores: { s: { name: 's', value: 0.5, reason: null, source: spec } },
      }),
    ];
    const ev = new PrecisionRecallEvaluator({
      scoreKey: 's',
      positiveFrom: 'expected_output',
    });
    const result = ev.evaluate(makeCtx(cases, 'my-experiment'));
    expect(result.curves[0]!.name).toBe('my-experiment');
  });
});
