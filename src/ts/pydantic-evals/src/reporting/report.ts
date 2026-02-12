/**
 * EvaluationReport, ReportCase, ReportCaseFailure, and aggregation.
 */

import type { EvaluationResult, EvaluatorFailure } from '../types.js';
import type { ReportAnalysis } from './analyses.js';

/**
 * A single case in an evaluation report.
 */
export interface ReportCase<TInputs = unknown, TOutput = unknown, TMetadata = unknown> {
  name: string;
  inputs: TInputs;
  metadata: TMetadata | null;
  expectedOutput: TOutput | null;
  output: TOutput;

  metrics: Record<string, number>;
  attributes: Record<string, unknown>;

  scores: Record<string, EvaluationResult<number>>;
  labels: Record<string, EvaluationResult<string>>;
  assertions: Record<string, EvaluationResult<boolean>>;

  taskDuration: number;
  totalDuration: number;

  sourceCaseName: string | null;
  traceId: string | null;
  spanId: string | null;

  evaluatorFailures: EvaluatorFailure[];
}

/**
 * A case that failed during task execution.
 */
export interface ReportCaseFailure<TInputs = unknown, TOutput = unknown, TMetadata = unknown> {
  name: string;
  inputs: TInputs;
  metadata: TMetadata | null;
  expectedOutput: TOutput | null;

  errorMessage: string;
  errorStacktrace: string;

  sourceCaseName: string | null;
  traceId: string | null;
  spanId: string | null;
}

/**
 * Aggregated statistics across a set of cases.
 */
export interface ReportCaseAggregate {
  name: string;
  scores: Record<string, number>;
  labels: Record<string, Record<string, number>>;
  metrics: Record<string, number>;
  assertions: number | null;
  taskDuration: number;
  totalDuration: number;
}

/**
 * Grouped results from running the same case multiple times.
 */
export interface ReportCaseGroup<TInputs = unknown, TOutput = unknown, TMetadata = unknown> {
  name: string;
  inputs: TInputs;
  metadata: TMetadata | null;
  expectedOutput: TOutput | null;
  runs: ReportCase<TInputs, TOutput, TMetadata>[];
  failures: ReportCaseFailure<TInputs, TOutput, TMetadata>[];
  summary: ReportCaseAggregate;
}

/**
 * A report of the results of evaluating a model on a set of cases.
 */
export interface EvaluationReport<TInputs = unknown, TOutput = unknown, TMetadata = unknown> {
  name: string;
  cases: ReportCase<TInputs, TOutput, TMetadata>[];
  failures: ReportCaseFailure<TInputs, TOutput, TMetadata>[];
  analyses: ReportAnalysis[];
  reportEvaluatorFailures: EvaluatorFailure[];
  experimentMetadata: Record<string, unknown> | null;
  traceId: string | null;
  spanId: string | null;

  /** Group cases by sourceCaseName. Returns null for single-run experiments. */
  caseGroups(): ReportCaseGroup<TInputs, TOutput, TMetadata>[] | null;
  /** Compute averages across all cases. */
  averages(): ReportCaseAggregate | null;
  /** Render the report as a formatted string. */
  render(opts?: RenderOptions): string;
  /** Print the report to the console. */
  print(opts?: RenderOptions): void;
}

export interface RenderOptions {
  width?: number;
  includeInput?: boolean;
  includeMetadata?: boolean;
  includeExpectedOutput?: boolean;
  includeOutput?: boolean;
  includeDurations?: boolean;
  includeTotalDuration?: boolean;
  includeAverages?: boolean;
  includeErrors?: boolean;
  includeAnalyses?: boolean;
}

// -- Factories --

export function createReportCase<TInputs, TOutput, TMetadata>(opts: {
  name: string;
  inputs: TInputs;
  metadata: TMetadata | null;
  expectedOutput: TOutput | null;
  output: TOutput;
  metrics: Record<string, number>;
  attributes: Record<string, unknown>;
  scores: Record<string, EvaluationResult<number>>;
  labels: Record<string, EvaluationResult<string>>;
  assertions: Record<string, EvaluationResult<boolean>>;
  taskDuration: number;
  totalDuration: number;
  sourceCaseName: string | null;
  evaluatorFailures?: EvaluatorFailure[];
}): ReportCase<TInputs, TOutput, TMetadata> {
  return {
    ...opts,
    traceId: null,
    spanId: null,
    evaluatorFailures: opts.evaluatorFailures ?? [],
  };
}

export function createReportCaseFailure<TInputs, TOutput, TMetadata>(opts: {
  name: string;
  inputs: TInputs;
  metadata: TMetadata | null;
  expectedOutput: TOutput | null;
  errorMessage: string;
  errorStacktrace: string;
  sourceCaseName: string | null;
}): ReportCaseFailure<TInputs, TOutput, TMetadata> {
  return {
    ...opts,
    traceId: null,
    spanId: null,
  };
}

export function createEvaluationReport<TInputs, TOutput, TMetadata>(opts: {
  name: string;
  cases: ReportCase<TInputs, TOutput, TMetadata>[];
  failures?: ReportCaseFailure<TInputs, TOutput, TMetadata>[];
  experimentMetadata?: Record<string, unknown> | null;
}): EvaluationReport<TInputs, TOutput, TMetadata> {
  const report: EvaluationReport<TInputs, TOutput, TMetadata> = {
    name: opts.name,
    cases: opts.cases,
    failures: opts.failures ?? [],
    analyses: [],
    reportEvaluatorFailures: [],
    experimentMetadata: opts.experimentMetadata ?? null,
    traceId: null,
    spanId: null,

    caseGroups() {
      return computeCaseGroups(report);
    },

    averages() {
      return computeAverages(report);
    },

    render(renderOpts) {
      // Lazy import to avoid circular deps
      return renderReport(report, renderOpts);
    },

    print(renderOpts) {
      // eslint-disable-next-line no-console
      console.log(report.render(renderOpts));
    },
  };

  return report;
}

// -- Aggregation --

export function averageCases(cases: ReportCase[]): ReportCaseAggregate {
  const n = cases.length;
  if (n === 0) {
    return {
      name: 'Averages',
      scores: {},
      labels: {},
      metrics: {},
      assertions: null,
      taskDuration: 0,
      totalDuration: 0,
    };
  }

  // Average scores
  const scoreCounts: Record<string, number> = {};
  const scoreSums: Record<string, number> = {};
  for (const c of cases) {
    for (const [k, v] of Object.entries(c.scores)) {
      scoreCounts[k] = (scoreCounts[k] ?? 0) + 1;
      scoreSums[k] = (scoreSums[k] ?? 0) + v.value;
    }
  }
  const avgScores: Record<string, number> = {};
  for (const k of Object.keys(scoreSums)) {
    avgScores[k] = scoreSums[k]! / scoreCounts[k]!;
  }

  // Average labels (distribution)
  const labelCounts: Record<string, number> = {};
  const labelSums: Record<string, Record<string, number>> = {};
  for (const c of cases) {
    for (const [k, v] of Object.entries(c.labels)) {
      labelCounts[k] = (labelCounts[k] ?? 0) + 1;
      if (!labelSums[k]) labelSums[k] = {};
      labelSums[k]![v.value] = (labelSums[k]![v.value] ?? 0) + 1;
    }
  }
  const avgLabels: Record<string, Record<string, number>> = {};
  for (const [k, counts] of Object.entries(labelSums)) {
    avgLabels[k] = {};
    for (const [label, count] of Object.entries(counts)) {
      avgLabels[k]![label] = count / labelCounts[k]!;
    }
  }

  // Average metrics
  const metricCounts: Record<string, number> = {};
  const metricSums: Record<string, number> = {};
  for (const c of cases) {
    for (const [k, v] of Object.entries(c.metrics)) {
      metricCounts[k] = (metricCounts[k] ?? 0) + 1;
      metricSums[k] = (metricSums[k] ?? 0) + v;
    }
  }
  const avgMetrics: Record<string, number> = {};
  for (const k of Object.keys(metricSums)) {
    avgMetrics[k] = metricSums[k]! / metricCounts[k]!;
  }

  // Average assertions
  let avgAssertions: number | null = null;
  const nAssertions = cases.reduce((sum, c) => sum + Object.keys(c.assertions).length, 0);
  if (nAssertions > 0) {
    const nPassing = cases.reduce(
      (sum, c) => sum + Object.values(c.assertions).filter((a) => a.value).length,
      0,
    );
    avgAssertions = nPassing / nAssertions;
  }

  return {
    name: 'Averages',
    scores: avgScores,
    labels: avgLabels,
    metrics: avgMetrics,
    assertions: avgAssertions,
    taskDuration: cases.reduce((sum, c) => sum + c.taskDuration, 0) / n,
    totalDuration: cases.reduce((sum, c) => sum + c.totalDuration, 0) / n,
  };
}

export function averageFromAggregates(aggregates: ReportCaseAggregate[]): ReportCaseAggregate {
  if (aggregates.length === 0) {
    return {
      name: 'Averages',
      scores: {},
      labels: {},
      metrics: {},
      assertions: null,
      taskDuration: 0,
      totalDuration: 0,
    };
  }

  const avgNumericDicts = (dicts: Record<string, number>[]): Record<string, number> => {
    const allKeys = new Set(dicts.flatMap((d) => Object.keys(d)));
    const result: Record<string, number> = {};
    for (const key of allKeys) {
      const vals = dicts.filter((d) => key in d).map((d) => d[key]!);
      if (vals.length > 0) {
        result[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
      }
    }
    return result;
  };

  const avgScores = avgNumericDicts(aggregates.map((a) => a.scores));
  const avgMetrics = avgNumericDicts(aggregates.map((a) => a.metrics));

  // Average labels
  const allLabelKeys = new Set(aggregates.flatMap((a) => Object.keys(a.labels)));
  const avgLabels: Record<string, Record<string, number>> = {};
  for (const key of allLabelKeys) {
    const combined: Record<string, number> = {};
    let count = 0;
    for (const a of aggregates) {
      if (key in a.labels) {
        count++;
        for (const [labelVal, freq] of Object.entries(a.labels[key]!)) {
          combined[labelVal] = (combined[labelVal] ?? 0) + freq;
        }
      }
    }
    avgLabels[key] = {};
    for (const [k, v] of Object.entries(combined)) {
      avgLabels[key]![k] = v / count;
    }
  }

  // Average assertions
  const assertionValues = aggregates.filter((a) => a.assertions !== null).map((a) => a.assertions!);
  const avgAssertions =
    assertionValues.length > 0
      ? assertionValues.reduce((a, b) => a + b, 0) / assertionValues.length
      : null;

  return {
    name: 'Averages',
    scores: avgScores,
    labels: avgLabels,
    metrics: avgMetrics,
    assertions: avgAssertions,
    taskDuration: aggregates.reduce((sum, a) => sum + a.taskDuration, 0) / aggregates.length,
    totalDuration: aggregates.reduce((sum, a) => sum + a.totalDuration, 0) / aggregates.length,
  };
}

function computeCaseGroups<TInputs, TOutput, TMetadata>(
  report: EvaluationReport<TInputs, TOutput, TMetadata>,
): ReportCaseGroup<TInputs, TOutput, TMetadata>[] | null {
  const hasSourceNames =
    report.cases.some((c) => c.sourceCaseName != null) ||
    report.failures.some((f) => f.sourceCaseName != null);

  if (!hasSourceNames) return null;

  const groups = new Map<
    string,
    {
      runs: ReportCase<TInputs, TOutput, TMetadata>[];
      failures: ReportCaseFailure<TInputs, TOutput, TMetadata>[];
    }
  >();

  for (const c of report.cases) {
    const key = c.sourceCaseName ?? c.name;
    if (!groups.has(key)) groups.set(key, { runs: [], failures: [] });
    groups.get(key)!.runs.push(c);
  }

  for (const f of report.failures) {
    const key = f.sourceCaseName ?? f.name;
    if (!groups.has(key)) groups.set(key, { runs: [], failures: [] });
    groups.get(key)!.failures.push(f);
  }

  const result: ReportCaseGroup<TInputs, TOutput, TMetadata>[] = [];
  for (const [name, { runs, failures }] of groups) {
    const first = runs[0] ?? failures[0]!;
    result.push({
      name,
      inputs: first.inputs,
      metadata: first.metadata,
      expectedOutput: first.expectedOutput,
      runs,
      failures,
      summary: averageCases(runs),
    });
  }

  return result;
}

function computeAverages<TInputs, TOutput, TMetadata>(
  report: EvaluationReport<TInputs, TOutput, TMetadata>,
): ReportCaseAggregate | null {
  const groups = report.caseGroups();
  if (groups !== null) {
    const nonEmpty = groups.filter((g) => g.runs.length > 0).map((g) => g.summary);
    return nonEmpty.length > 0 ? averageFromAggregates(nonEmpty) : null;
  }
  if (report.cases.length > 0) {
    return averageCases(report.cases);
  }
  return null;
}

// -- Rendering (simple text-based) --

function renderReport<TInputs, TOutput, TMetadata>(
  report: EvaluationReport<TInputs, TOutput, TMetadata>,
  opts?: RenderOptions,
): string {
  const includeDurations = opts?.includeDurations ?? true;
  const includeAverages = opts?.includeAverages ?? true;
  const includeAnalyses = opts?.includeAnalyses ?? true;

  const lines: string[] = [];
  lines.push(`Evaluation Summary: ${report.name}`);
  lines.push('='.repeat(60));

  // Determine which columns to show
  const hasScores = report.cases.some((c) => Object.keys(c.scores).length > 0);
  const hasLabels = report.cases.some((c) => Object.keys(c.labels).length > 0);
  const hasAssertions = report.cases.some((c) => Object.keys(c.assertions).length > 0);
  const hasMetrics = report.cases.some((c) => Object.keys(c.metrics).length > 0);

  for (const c of report.cases) {
    const parts: string[] = [`  ${c.name}`];

    if (hasAssertions) {
      const total = Object.keys(c.assertions).length;
      const passing = Object.values(c.assertions).filter((a) => a.value).length;
      parts.push(`assertions: ${passing}/${total}`);
    }

    if (hasScores) {
      const scoreStrs = Object.entries(c.scores).map(([k, v]) => `${k}=${v.value}`);
      if (scoreStrs.length > 0) parts.push(`scores: ${scoreStrs.join(', ')}`);
    }

    if (hasLabels) {
      const labelStrs = Object.entries(c.labels).map(([k, v]) => `${k}=${v.value}`);
      if (labelStrs.length > 0) parts.push(`labels: ${labelStrs.join(', ')}`);
    }

    if (hasMetrics) {
      const metricStrs = Object.entries(c.metrics).map(([k, v]) => `${k}=${v}`);
      if (metricStrs.length > 0) parts.push(`metrics: ${metricStrs.join(', ')}`);
    }

    if (includeDurations) {
      parts.push(`duration: ${formatDuration(c.taskDuration)}`);
    }

    lines.push(parts.join(' | '));
  }

  if (includeAverages) {
    const avg = report.averages();
    if (avg) {
      lines.push('-'.repeat(60));
      const parts: string[] = [`  Averages`];
      if (avg.assertions !== null) {
        parts.push(`assertions: ${(avg.assertions * 100).toFixed(1)}%`);
      }
      if (includeDurations) {
        parts.push(`duration: ${formatDuration(avg.taskDuration)}`);
      }
      lines.push(parts.join(' | '));
    }
  }

  if (report.failures.length > 0 && (opts?.includeErrors ?? true)) {
    lines.push('');
    lines.push('Failures:');
    for (const f of report.failures) {
      lines.push(`  ${f.name}: ${f.errorMessage}`);
    }
  }

  if (includeAnalyses && report.analyses.length > 0) {
    lines.push('');
    lines.push('Analyses:');
    for (const a of report.analyses) {
      lines.push(`  ${a.title} (${a.type})`);
    }
  }

  return lines.join('\n');
}

function formatDuration(seconds: number): string {
  if (seconds < 0.001) return `${(seconds * 1_000_000).toFixed(0)}\u00b5s`;
  if (seconds < 1) return `${(seconds * 1000).toFixed(1)}ms`;
  return `${seconds.toFixed(1)}s`;
}
