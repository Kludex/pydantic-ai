import { describe, expect, it } from 'vitest';
import {
  defaultRenderDuration,
  defaultRenderDurationDiff,
  defaultRenderNumber,
  defaultRenderNumberDiff,
  defaultRenderPercentage,
} from '../src/reporting/render-numbers.js';
import {
  averageCases,
  averageFromAggregates,
  createEvaluationReport,
  createReportCase,
  createReportCaseFailure,
  type ReportCase,
  type ReportCaseAggregate,
} from '../src/reporting/report.js';

// ============ Report creation ============

function makeCase(
  name: string,
  overrides?: Partial<Parameters<typeof createReportCase>[0]>,
): ReportCase {
  return createReportCase({
    name,
    inputs: overrides?.inputs ?? 'input',
    metadata: overrides?.metadata ?? null,
    expectedOutput: overrides?.expectedOutput ?? null,
    output: overrides?.output ?? 'output',
    metrics: overrides?.metrics ?? {},
    attributes: overrides?.attributes ?? {},
    scores: overrides?.scores ?? {},
    labels: overrides?.labels ?? {},
    assertions: overrides?.assertions ?? {},
    taskDuration: overrides?.taskDuration ?? 1.0,
    totalDuration: overrides?.totalDuration ?? 1.5,
    sourceCaseName: overrides?.sourceCaseName ?? null,
    evaluatorFailures: overrides?.evaluatorFailures ?? [],
  });
}

describe('createReportCase', () => {
  it('creates a report case with default traceId/spanId', () => {
    const c = makeCase('test');
    expect(c.name).toBe('test');
    expect(c.traceId).toBeNull();
    expect(c.spanId).toBeNull();
    expect(c.evaluatorFailures).toEqual([]);
  });
});

describe('createReportCaseFailure', () => {
  it('creates a failure case', () => {
    const f = createReportCaseFailure({
      name: 'fail',
      inputs: 'in',
      metadata: null,
      expectedOutput: null,
      errorMessage: 'Error: boom',
      errorStacktrace: 'at ...',
      sourceCaseName: null,
    });
    expect(f.name).toBe('fail');
    expect(f.errorMessage).toBe('Error: boom');
    expect(f.traceId).toBeNull();
    expect(f.spanId).toBeNull();
  });
});

describe('createEvaluationReport', () => {
  it('creates a report with defaults', () => {
    const report = createEvaluationReport({ name: 'test', cases: [] });
    expect(report.name).toBe('test');
    expect(report.failures).toEqual([]);
    expect(report.analyses).toEqual([]);
    expect(report.reportEvaluatorFailures).toEqual([]);
    expect(report.experimentMetadata).toBeNull();
    expect(report.traceId).toBeNull();
  });

  it('caseGroups returns null for single-run experiments', () => {
    const c = makeCase('c1');
    const report = createEvaluationReport({ name: 'test', cases: [c] });
    expect(report.caseGroups()).toBeNull();
  });

  it('caseGroups returns groups for repeated experiments', () => {
    const c1 = makeCase('c1 [1/2]', { sourceCaseName: 'c1' });
    const c2 = makeCase('c1 [2/2]', { sourceCaseName: 'c1' });
    const report = createEvaluationReport({ name: 'test', cases: [c1, c2] });
    const groups = report.caseGroups();
    expect(groups).not.toBeNull();
    expect(groups).toHaveLength(1);
    expect(groups![0]!.name).toBe('c1');
    expect(groups![0]!.runs).toHaveLength(2);
  });

  it('caseGroups includes failures', () => {
    const c1 = makeCase('c1 [1/2]', { sourceCaseName: 'c1' });
    const f1 = createReportCaseFailure({
      name: 'c1 [2/2]',
      inputs: 'in',
      metadata: null,
      expectedOutput: null,
      errorMessage: 'boom',
      errorStacktrace: '',
      sourceCaseName: 'c1',
    });
    const report = createEvaluationReport({ name: 'test', cases: [c1], failures: [f1] });
    const groups = report.caseGroups();
    expect(groups).not.toBeNull();
    expect(groups![0]!.failures).toHaveLength(1);
  });

  it('averages returns null for empty report', () => {
    const report = createEvaluationReport({ name: 'test', cases: [] });
    expect(report.averages()).toBeNull();
  });

  it('averages computes for single-run experiments', () => {
    const c1 = makeCase('c1', { taskDuration: 2.0, totalDuration: 3.0 });
    const c2 = makeCase('c2', { taskDuration: 4.0, totalDuration: 5.0 });
    const report = createEvaluationReport({ name: 'test', cases: [c1, c2] });
    const avg = report.averages();
    expect(avg).not.toBeNull();
    expect(avg!.taskDuration).toBe(3.0);
    expect(avg!.totalDuration).toBe(4.0);
  });

  it('averages computes for repeated experiments', () => {
    const c1 = makeCase('c1 [1/2]', { sourceCaseName: 'c1', taskDuration: 2.0 });
    const c2 = makeCase('c1 [2/2]', { sourceCaseName: 'c1', taskDuration: 4.0 });
    const report = createEvaluationReport({ name: 'test', cases: [c1, c2] });
    const avg = report.averages();
    expect(avg).not.toBeNull();
    expect(avg!.taskDuration).toBe(3.0);
  });

  it('render produces text output', () => {
    const c = makeCase('c1', {
      assertions: {
        pass: {
          name: 'pass',
          value: true,
          reason: null,
          source: { name: 'Equals', arguments: null },
        },
      },
      scores: {
        score: {
          name: 'score',
          value: 0.9,
          reason: null,
          source: { name: 'Score', arguments: null },
        },
      },
      labels: {
        label: {
          name: 'label',
          value: 'good',
          reason: null,
          source: { name: 'Label', arguments: null },
        },
      },
      metrics: { tokens: 100 },
    });
    const report = createEvaluationReport({ name: 'My Test', cases: [c] });
    const text = report.render();
    expect(text).toContain('My Test');
    expect(text).toContain('c1');
    expect(text).toContain('assertions');
    expect(text).toContain('scores');
  });

  it('render formats sub-millisecond durations', () => {
    const c = makeCase('fast', { taskDuration: 0.0005 }); // 500µs
    const report = createEvaluationReport({ name: 'test', cases: [c] });
    const text = report.render();
    expect(text).toContain('µs');
  });

  it('render formats millisecond durations', () => {
    const c = makeCase('medium', { taskDuration: 0.05 }); // 50ms
    const report = createEvaluationReport({ name: 'test', cases: [c] });
    const text = report.render();
    expect(text).toContain('ms');
  });

  it('render with options', () => {
    const c = makeCase('c1');
    const report = createEvaluationReport({ name: 'test', cases: [c] });
    const text = report.render({ includeDurations: false, includeAverages: false });
    expect(text).not.toContain('duration');
    expect(text).not.toContain('Averages');
  });

  it('render with includeErrors false hides failures', () => {
    const f = createReportCaseFailure({
      name: 'bad',
      inputs: 'in',
      metadata: null,
      expectedOutput: null,
      errorMessage: 'Error: hidden',
      errorStacktrace: '',
      sourceCaseName: null,
    });
    const report = createEvaluationReport({ name: 'test', cases: [], failures: [f] });
    const text = report.render({ includeErrors: false });
    expect(text).not.toContain('Failures');
  });

  it('render with includeAnalyses false hides analyses', () => {
    const report = createEvaluationReport({ name: 'test', cases: [] });
    report.analyses.push({
      type: 'scalar',
      title: 'Hidden',
      value: 1,
    });
    const text = report.render({ includeAnalyses: false });
    expect(text).not.toContain('Hidden');
  });

  it('render includes failures', () => {
    const f = createReportCaseFailure({
      name: 'bad',
      inputs: 'in',
      metadata: null,
      expectedOutput: null,
      errorMessage: 'Error: failed',
      errorStacktrace: '',
      sourceCaseName: null,
    });
    const report = createEvaluationReport({ name: 'test', cases: [], failures: [f] });
    const text = report.render();
    expect(text).toContain('Failures');
    expect(text).toContain('Error: failed');
  });

  it('render includes analyses', () => {
    const report = createEvaluationReport({ name: 'test', cases: [] });
    report.analyses.push({
      type: 'confusion_matrix',
      title: 'Test Matrix',
      classLabels: ['a', 'b'],
      matrix: [
        [1, 0],
        [0, 1],
      ],
    });
    const text = report.render();
    expect(text).toContain('Analyses');
    expect(text).toContain('Test Matrix');
  });

  it('print calls console.log', () => {
    const c = makeCase('c1');
    const report = createEvaluationReport({ name: 'test', cases: [c] });
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(String(args[0]));
    try {
      report.print();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toContain('test');
    } finally {
      console.log = origLog;
    }
  });
});

// ============ Aggregation ============

describe('averageCases', () => {
  it('returns empty aggregate for no cases', () => {
    const avg = averageCases([]);
    expect(avg.name).toBe('Averages');
    expect(avg.scores).toEqual({});
    expect(avg.labels).toEqual({});
    expect(avg.metrics).toEqual({});
    expect(avg.assertions).toBeNull();
    expect(avg.taskDuration).toBe(0);
  });

  it('averages scores', () => {
    const cases = [
      makeCase('a', {
        scores: {
          accuracy: {
            name: 'accuracy',
            value: 0.8,
            reason: null,
            source: { name: 'S', arguments: null },
          },
        },
      }),
      makeCase('b', {
        scores: {
          accuracy: {
            name: 'accuracy',
            value: 1.0,
            reason: null,
            source: { name: 'S', arguments: null },
          },
        },
      }),
    ];
    const avg = averageCases(cases);
    expect(avg.scores.accuracy).toBe(0.9);
  });

  it('averages labels (distributions)', () => {
    const cases = [
      makeCase('a', {
        labels: {
          category: {
            name: 'category',
            value: 'cat',
            reason: null,
            source: { name: 'L', arguments: null },
          },
        },
      }),
      makeCase('b', {
        labels: {
          category: {
            name: 'category',
            value: 'dog',
            reason: null,
            source: { name: 'L', arguments: null },
          },
        },
      }),
    ];
    const avg = averageCases(cases);
    expect(avg.labels.category!.cat).toBe(0.5);
    expect(avg.labels.category!.dog).toBe(0.5);
  });

  it('averages metrics', () => {
    const cases = [
      makeCase('a', { metrics: { tokens: 100 } }),
      makeCase('b', { metrics: { tokens: 200 } }),
    ];
    const avg = averageCases(cases);
    expect(avg.metrics.tokens).toBe(150);
  });

  it('averages assertions', () => {
    const spec = { name: 'E', arguments: null };
    const cases = [
      makeCase('a', {
        assertions: {
          pass: { name: 'pass', value: true, reason: null, source: spec },
          check: { name: 'check', value: false, reason: null, source: spec },
        },
      }),
      makeCase('b', {
        assertions: {
          pass: { name: 'pass', value: true, reason: null, source: spec },
          check: { name: 'check', value: true, reason: null, source: spec },
        },
      }),
    ];
    const avg = averageCases(cases);
    expect(avg.assertions).toBe(0.75); // 3 of 4 passing
  });

  it('assertions null when no cases have assertions', () => {
    const avg = averageCases([makeCase('a'), makeCase('b')]);
    expect(avg.assertions).toBeNull();
  });

  it('averages durations', () => {
    const cases = [
      makeCase('a', { taskDuration: 2.0, totalDuration: 3.0 }),
      makeCase('b', { taskDuration: 4.0, totalDuration: 5.0 }),
    ];
    const avg = averageCases(cases);
    expect(avg.taskDuration).toBe(3.0);
    expect(avg.totalDuration).toBe(4.0);
  });
});

describe('averageFromAggregates', () => {
  it('returns empty aggregate for no inputs', () => {
    const avg = averageFromAggregates([]);
    expect(avg.name).toBe('Averages');
    expect(avg.scores).toEqual({});
    expect(avg.assertions).toBeNull();
  });

  it('averages multiple aggregates', () => {
    const aggs: ReportCaseAggregate[] = [
      {
        name: 'g1',
        scores: { x: 0.8 },
        labels: { cat: { a: 0.5, b: 0.5 } },
        metrics: { tok: 100 },
        assertions: 1.0,
        taskDuration: 1.0,
        totalDuration: 2.0,
      },
      {
        name: 'g2',
        scores: { x: 0.6 },
        labels: { cat: { a: 0.3, b: 0.7 } },
        metrics: { tok: 200 },
        assertions: 0.5,
        taskDuration: 3.0,
        totalDuration: 4.0,
      },
    ];
    const avg = averageFromAggregates(aggs);
    expect(avg.scores.x).toBe(0.7);
    expect(avg.metrics.tok).toBe(150);
    expect(avg.assertions).toBe(0.75);
    expect(avg.labels.cat!.a).toBeCloseTo(0.4);
    expect(avg.labels.cat!.b).toBeCloseTo(0.6);
    expect(avg.taskDuration).toBe(2.0);
    expect(avg.totalDuration).toBe(3.0);
  });

  it('handles null assertions in some aggregates', () => {
    const aggs: ReportCaseAggregate[] = [
      {
        name: 'g1',
        scores: {},
        labels: {},
        metrics: {},
        assertions: 0.8,
        taskDuration: 1,
        totalDuration: 1,
      },
      {
        name: 'g2',
        scores: {},
        labels: {},
        metrics: {},
        assertions: null,
        taskDuration: 1,
        totalDuration: 1,
      },
    ];
    const avg = averageFromAggregates(aggs);
    expect(avg.assertions).toBe(0.8);
  });

  it('handles all null assertions', () => {
    const aggs: ReportCaseAggregate[] = [
      {
        name: 'g1',
        scores: {},
        labels: {},
        metrics: {},
        assertions: null,
        taskDuration: 1,
        totalDuration: 1,
      },
    ];
    const avg = averageFromAggregates(aggs);
    expect(avg.assertions).toBeNull();
  });
});

// ============ Number formatting ============

describe('defaultRenderNumber', () => {
  it('formats integers with commas', () => {
    expect(defaultRenderNumber(1000)).toBe('1,000');
    expect(defaultRenderNumber(0)).toBe('0');
    expect(defaultRenderNumber(-1000)).toBe('-1,000');
  });

  it('formats floats with sig figs', () => {
    expect(defaultRenderNumber(3.14)).toBe('3.14');
    expect(defaultRenderNumber(0.001)).toBe('0.00100');
  });

  it('formats large floats', () => {
    expect(defaultRenderNumber(1234.5)).toBe('1,234.5');
  });

  it('formats zero as float', () => {
    expect(defaultRenderNumber(0.0)).toBe('0');
  });

  it('formats negative floats', () => {
    const result = defaultRenderNumber(-3.14);
    expect(result).toBe('-3.14');
  });
});

describe('defaultRenderPercentage', () => {
  it('formats percentage', () => {
    expect(defaultRenderPercentage(0.95)).toBe('95.0%');
    expect(defaultRenderPercentage(1.0)).toBe('100.0%');
  });
});

describe('defaultRenderNumberDiff', () => {
  it('returns null when equal', () => {
    expect(defaultRenderNumberDiff(42, 42)).toBeNull();
  });

  it('formats integer diff', () => {
    expect(defaultRenderNumberDiff(10, 15)).toBe('+5');
    expect(defaultRenderNumberDiff(15, 10)).toBe('-5');
  });

  it('formats float diff with relative change (small delta)', () => {
    // 1.0 -> 1.5 = +50% change (> 1x so multiplier used)
    const result = defaultRenderNumberDiff(1.0, 1.5);
    expect(result).not.toBeNull();
    expect(result).toContain('+');
  });

  it('formats float diff with percentage (small relative change)', () => {
    // 10.0 -> 10.5 = +5% change (< 100% so percentage used)
    const result = defaultRenderNumberDiff(10.0, 10.5);
    expect(result).not.toBeNull();
    expect(result).toContain('%');
  });

  it('handles zero base (no relative)', () => {
    const result = defaultRenderNumberDiff(0.0, 1.5);
    expect(result).not.toBeNull();
  });

  it('formats negative diff', () => {
    const result = defaultRenderNumberDiff(1.0, 0.5);
    expect(result).not.toBeNull();
    expect(result).toContain('-');
  });

  it('large multiplier uses integer format', () => {
    // 1.1 -> 200.1 => multiplier > 100 => integer x format
    const result = defaultRenderNumberDiff(1.1, 200.1);
    expect(result).not.toBeNull();
    expect(result).toContain('x');
  });

  it('drops relative for very small base with huge change', () => {
    // base < 0.01, delta > 10x base
    const result = defaultRenderNumberDiff(0.001, 1.0);
    expect(result).not.toBeNull();
    // Only absolute shown, no relative part
  });

  it('returns null relative for tiny change (+0.0%)', () => {
    // Change so small that percentage rounds to +0.0%
    const result = defaultRenderNumberDiff(1000.0, 1000.001);
    expect(result).not.toBeNull();
  });
});

describe('defaultRenderDuration', () => {
  it('formats seconds', () => {
    expect(defaultRenderDuration(1.5)).toBe('1.5s');
  });

  it('formats milliseconds', () => {
    expect(defaultRenderDuration(0.5)).toBe('500.0ms');
  });

  it('formats microseconds', () => {
    const result = defaultRenderDuration(0.0005);
    expect(result).toBe('500\u00b5s');
  });

  it('formats sub-microseconds', () => {
    // Very small value: 0.1µs precision
    const result = defaultRenderDuration(0.0000001);
    expect(result).toContain('\u00b5s');
  });

  it('formats negative durations', () => {
    const result = defaultRenderDuration(-0.5);
    expect(result).toBe('-500.0ms');
  });

  it('formats zero', () => {
    expect(defaultRenderDuration(0)).toBe('0s');
  });
});

describe('defaultRenderDurationDiff', () => {
  it('returns null when equal', () => {
    expect(defaultRenderDurationDiff(1.0, 1.0)).toBeNull();
  });

  it('formats duration diff with relative', () => {
    // 1.0 -> 1.5 = +50% change
    const result = defaultRenderDurationDiff(1.0, 1.5);
    expect(result).not.toBeNull();
    expect(result).toContain('+');
    expect(result).toContain('%');
  });

  it('formats duration diff large change', () => {
    const result = defaultRenderDurationDiff(1.0, 5.0);
    expect(result).not.toBeNull();
    expect(result).toContain('x');
  });

  it('formats negative duration diff', () => {
    const result = defaultRenderDurationDiff(2.0, 1.0);
    expect(result).not.toBeNull();
    expect(result).toContain('-');
  });

  it('formats duration diff with dropped relative (very small base)', () => {
    // base < 0.01 and huge change -> relative dropped
    const result = defaultRenderDurationDiff(0.001, 100.0);
    expect(result).not.toBeNull();
    expect(result).not.toContain('/');
  });

  it('formats duration diff with tiny change (null relative)', () => {
    // Change so tiny that percentage rounds to +0.0%
    const result = defaultRenderDurationDiff(1.0, 1.0000001);
    expect(result).not.toBeNull();
    expect(result).not.toContain('/');
  });
});

// -- renderSigned and formatSigFigs edge cases --
describe('defaultRenderNumberDiff edge cases', () => {
  it('renderSigned with zero delta', () => {
    // 1.5 -> 1.5 returns null, but 1.5 -> 1.50001 should produce tiny diff
    const result = defaultRenderNumberDiff(1.5, 1.50001);
    expect(result).not.toBeNull();
    expect(result).toContain('+');
  });

  it('renderSigned with exact integer-like float', () => {
    // 1.5 -> 201.5 = diff is 200.0, which formatSigFigs returns '200' (no decimal)
    // renderSigned should add '.0'
    const result = defaultRenderNumberDiff(1.5, 201.5);
    expect(result).not.toBeNull();
    expect(result).toContain('+200.0');
  });

  it('handles very small float diff producing scientific notation', () => {
    // Very small numbers can produce scientific notation in toPrecision
    const result = defaultRenderNumberDiff(0.0001, 0.0001001);
    expect(result).not.toBeNull();
  });
});

// -- Report averages and formatDuration --
describe('report averages', () => {
  it('averages from single-run cases', () => {
    const report = createEvaluationReport({
      name: 'test',
      cases: [
        createReportCase({
          name: 'a',
          inputs: 'x',
          metadata: null,
          expectedOutput: null,
          output: 'y',
          metrics: { m: 1 },
          attributes: {},
          scores: {},
          labels: {},
          assertions: {},
          taskDuration: 1.0,
          totalDuration: 1.5,
          sourceCaseName: null,
        }),
      ],
    });
    const avg = report.averages();
    expect(avg).not.toBeNull();
    expect(avg!.metrics.m).toBe(1);
  });

  it('averages from repeated experiments', () => {
    const cases = [
      createReportCase({
        name: 'a_1',
        inputs: 'x',
        metadata: null,
        expectedOutput: null,
        output: 'y',
        metrics: { m: 1 },
        attributes: {},
        scores: {},
        labels: {},
        assertions: {},
        taskDuration: 1.0,
        totalDuration: 1.5,
        sourceCaseName: 'a',
      }),
      createReportCase({
        name: 'a_2',
        inputs: 'x',
        metadata: null,
        expectedOutput: null,
        output: 'z',
        metrics: { m: 3 },
        attributes: {},
        scores: {},
        labels: {},
        assertions: {},
        taskDuration: 2.0,
        totalDuration: 2.5,
        sourceCaseName: 'a',
      }),
    ];
    const report = createEvaluationReport({ name: 'test', cases });
    const avg = report.averages();
    expect(avg).not.toBeNull();
    expect(avg!.metrics.m).toBe(2);
  });

  it('averages returns null for empty repeated experiment', () => {
    // All cases are failures, no runs
    const report = createEvaluationReport({
      name: 'test',
      cases: [],
      failures: [
        createReportCaseFailure({
          name: 'fail_1',
          inputs: 'x',
          metadata: null,
          expectedOutput: null,
          errorMessage: 'err',
          errorStacktrace: '',
          sourceCaseName: 'fail',
        }),
      ],
    });
    const avg = report.averages();
    expect(avg).toBeNull();
  });
});
