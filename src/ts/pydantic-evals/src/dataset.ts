/**
 * Dataset and Case: the core data structures for evaluation.
 *
 * A Dataset contains a list of Cases, each with inputs, optional expected output,
 * optional metadata, and optional case-specific evaluators. The Dataset can be
 * evaluated against a task function to produce an EvaluationReport.
 */

import pLimit from 'p-limit';
import { withTaskRun } from './context.js';
import type { EvaluatorContext } from './evaluators/context.js';
import { createEvaluatorContext } from './evaluators/context.js';
import type { Evaluator } from './evaluators/evaluator.js';
import type { ReportEvaluator, ReportEvaluatorContext } from './evaluators/report-evaluator.js';
import { runEvaluator } from './evaluators/run-evaluator.js';
import { withSpanCapture } from './otel/context-subtree.js';
import type { EvaluationReport, ReportCase, ReportCaseFailure } from './reporting/report.js';
import {
  createEvaluationReport,
  createReportCase,
  createReportCaseFailure,
} from './reporting/report.js';
import type { EvaluationResult, EvaluatorFailure } from './types.js';

/**
 * A single test case.
 */
export interface Case<TInputs = unknown, TOutput = unknown, TMetadata = unknown> {
  /** Name of the case. Used to identify the case in the report. */
  name?: string | null;
  /** Inputs to the task. */
  inputs: TInputs;
  /** Metadata for the case. */
  metadata?: TMetadata | null;
  /** Expected output of the task. */
  expectedOutput?: TOutput | null;
  /** Evaluators specific to this case. */
  evaluators?: Evaluator[];
}

export interface DatasetOptions<TInputs = unknown, TOutput = unknown, TMetadata = unknown> {
  /** Optional name for the dataset. */
  name?: string | null;
  /** List of test cases. */
  cases: Case<TInputs, TOutput, TMetadata>[];
  /** Evaluators to apply to all cases. */
  evaluators?: Evaluator[];
  /** Report evaluators that run on the full report. */
  reportEvaluators?: ReportEvaluator[];
}

export interface EvaluateOptions {
  /** Name for the evaluation run. Defaults to the task function name. */
  name?: string;
  /** Maximum number of concurrent task executions. */
  maxConcurrency?: number;
  /** Whether to show progress. */
  progress?: boolean;
  /** Number of times to run each case. */
  repeat?: number;
  /** Experiment-level metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * A dataset of test cases.
 */
export class Dataset<TInputs = unknown, TOutput = unknown, TMetadata = unknown> {
  name: string | null;
  cases: Case<TInputs, TOutput, TMetadata>[];
  evaluators: Evaluator[];
  reportEvaluators: ReportEvaluator[];

  constructor(opts: DatasetOptions<TInputs, TOutput, TMetadata>) {
    // Validate no duplicate case names
    const names = new Set<string>();
    for (const c of opts.cases) {
      if (c.name != null) {
        if (names.has(c.name)) {
          throw new Error(`Duplicate case name: '${c.name}'`);
        }
        names.add(c.name);
      }
    }

    this.name = opts.name ?? null;
    this.cases = [...opts.cases];
    this.evaluators = [...(opts.evaluators ?? [])];
    this.reportEvaluators = [...(opts.reportEvaluators ?? [])];
  }

  /**
   * Add a case to the dataset.
   */
  addCase(c: Case<TInputs, TOutput, TMetadata>): void {
    if (c.name != null && this.cases.some((existing) => existing.name === c.name)) {
      throw new Error(`Duplicate case name: '${c.name}'`);
    }
    this.cases.push(c);
  }

  /**
   * Add an evaluator to the dataset or a specific case.
   */
  addEvaluator(evaluator: Evaluator, specificCase?: string): void {
    if (specificCase === undefined) {
      this.evaluators.push(evaluator);
    } else {
      let found = false;
      for (const c of this.cases) {
        if (c.name === specificCase) {
          if (!c.evaluators) c.evaluators = [];
          c.evaluators.push(evaluator);
          found = true;
        }
      }
      if (!found) {
        throw new Error(`Case '${specificCase}' not found in the dataset`);
      }
    }
  }

  /**
   * Evaluate all cases in the dataset against a task function.
   */
  async evaluate(
    task: (inputs: TInputs) => TOutput | Promise<TOutput>,
    opts?: EvaluateOptions,
  ): Promise<EvaluationReport<TInputs, TOutput, TMetadata>> {
    const repeat = opts?.repeat ?? 1;
    if (repeat < 1) throw new Error(`repeat must be >= 1, got ${repeat}`);

    const taskName = opts?.name ?? (task.name || 'task');
    const maxConcurrency = opts?.maxConcurrency;
    const limit = maxConcurrency ? pLimit(maxConcurrency) : pLimit(Infinity);

    // Build task list
    const tasksToRun = this.buildTasksToRun(repeat);

    // Run all tasks concurrently
    const results = await Promise.all(
      tasksToRun.map(([c, reportName, sourceName]) =>
        limit(() => this.runTaskAndEvaluators(task, c, reportName, sourceName)),
      ),
    );

    const cases: ReportCase<TInputs, TOutput, TMetadata>[] = [];
    const failures: ReportCaseFailure<TInputs, TOutput, TMetadata>[] = [];

    for (const item of results) {
      if ('output' in item) {
        cases.push(item);
      } else {
        failures.push(item);
      }
    }

    const report = createEvaluationReport<TInputs, TOutput, TMetadata>({
      name: taskName,
      cases,
      failures,
      experimentMetadata: opts?.metadata ?? null,
    });

    // Run report evaluators
    if (this.reportEvaluators.length > 0) {
      const reportCtx: ReportEvaluatorContext = {
        name: taskName,
        report,
        experimentMetadata: opts?.metadata ?? null,
      };
      await this.runReportEvaluators(reportCtx, report);
    }

    return report;
  }

  private buildTasksToRun(
    repeat: number,
  ): [Case<TInputs, TOutput, TMetadata>, string, string | null][] {
    if (repeat > 1) {
      return this.cases.flatMap((c, i) => {
        const caseName = c.name ?? `Case ${i + 1}`;
        return Array.from({ length: repeat }, (_, runIdx) => {
          const reportName = `${caseName} [${runIdx + 1}/${repeat}]`;
          return [c, reportName, caseName] as [
            Case<TInputs, TOutput, TMetadata>,
            string,
            string | null,
          ];
        });
      });
    }
    return this.cases.map((c, i) => [c, c.name ?? `Case ${i + 1}`, null]);
  }

  private async runTaskAndEvaluators(
    task: (inputs: TInputs) => TOutput | Promise<TOutput>,
    c: Case<TInputs, TOutput, TMetadata>,
    reportCaseName: string,
    sourceCaseName: string | null,
  ): Promise<
    ReportCase<TInputs, TOutput, TMetadata> | ReportCaseFailure<TInputs, TOutput, TMetadata>
  > {
    try {
      // Run the task with context tracking
      const t0 = performance.now();

      const {
        result: taskRunResult,
        attributes,
        metrics,
      } = await withTaskRun(async () => {
        const { result: output, spanTree } = await withSpanCapture(async () => {
          return await task(c.inputs);
        });
        return { output, spanTree };
      });

      const duration = (performance.now() - t0) / 1000; // Convert to seconds
      const { output, spanTree } = taskRunResult;

      const ctx: EvaluatorContext<TInputs, TOutput, TMetadata> = createEvaluatorContext({
        name: c.name ?? null,
        inputs: c.inputs,
        metadata: c.metadata ?? null,
        expectedOutput: c.expectedOutput ?? null,
        output: output as TOutput,
        duration,
        attributes,
        metrics,
        spanTreeOrError: spanTree,
      });

      // Run evaluators
      const allEvaluators = [...(c.evaluators ?? []), ...this.evaluators];
      const evaluatorOutputs: EvaluationResult[] = [];
      const evaluatorFailures: EvaluatorFailure[] = [];

      if (allEvaluators.length > 0) {
        const results = await Promise.all(allEvaluators.map((ev) => runEvaluator(ev, ctx)));

        for (const result of results) {
          if (Array.isArray(result)) {
            evaluatorOutputs.push(...result);
          } else {
            evaluatorFailures.push(result);
          }
        }
      }

      // Group results by type
      const { assertions, scores, labels } = groupEvaluatorOutputsByType(evaluatorOutputs);
      const totalDuration = (performance.now() - t0) / 1000;

      return createReportCase<TInputs, TOutput, TMetadata>({
        name: reportCaseName,
        inputs: c.inputs,
        metadata: c.metadata ?? null,
        expectedOutput: c.expectedOutput ?? null,
        output: output as TOutput,
        metrics,
        attributes,
        scores,
        labels,
        assertions,
        taskDuration: duration,
        totalDuration,
        sourceCaseName,
        evaluatorFailures,
      });
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      return createReportCaseFailure<TInputs, TOutput, TMetadata>({
        name: reportCaseName,
        inputs: c.inputs,
        metadata: c.metadata ?? null,
        expectedOutput: c.expectedOutput ?? null,
        errorMessage: `${error.name}: ${error.message}`,
        errorStacktrace: error.stack ?? '',
        sourceCaseName,
      });
    }
  }

  private async runReportEvaluators(
    ctx: ReportEvaluatorContext,
    report: EvaluationReport<TInputs, TOutput, TMetadata>,
  ): Promise<void> {
    for (const reportEval of this.reportEvaluators) {
      try {
        const result = await reportEval.evaluate(ctx);
        if (Array.isArray(result)) {
          report.analyses.push(...result);
        } else {
          report.analyses.push(result);
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        report.reportEvaluatorFailures.push({
          name: reportEval.getSerializationName(),
          errorMessage: `${error.name}: ${error.message}`,
          errorStacktrace: error.stack ?? '',
          source: reportEval.asSpec(),
        });
      }
    }
  }
}

function groupEvaluatorOutputsByType(results: EvaluationResult[]): {
  assertions: Record<string, EvaluationResult<boolean>>;
  scores: Record<string, EvaluationResult<number>>;
  labels: Record<string, EvaluationResult<string>>;
} {
  const assertions: Record<string, EvaluationResult<boolean>> = {};
  const scores: Record<string, EvaluationResult<number>> = {};
  const labels: Record<string, EvaluationResult<string>> = {};
  const seenNames = new Set<string>();

  for (const er of results) {
    let name = er.name;
    if (seenNames.has(name)) {
      let suffix = 2;
      while (seenNames.has(`${name}_${suffix}`)) suffix++;
      name = `${name}_${suffix}`;
    }
    seenNames.add(name);

    if (typeof er.value === 'boolean') {
      assertions[name] = { ...er, name, value: er.value };
    } else if (typeof er.value === 'number') {
      scores[name] = { ...er, name, value: er.value };
    } else if (typeof er.value === 'string') {
      labels[name] = { ...er, name, value: er.value };
    }
  }

  return { assertions, scores, labels };
}

// Re-export context helpers for user access
export { incrementEvalMetric, setEvalAttribute } from './context.js';
