/**
 * Terminal table rendering with chalk + cli-table3.
 *
 * Provides a richer table output for EvaluationReports.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import {
  defaultRenderDuration,
  defaultRenderNumber,
  defaultRenderPercentage,
} from './render-numbers.js';
import type { EvaluationReport, ReportCase, ReportCaseAggregate } from './report.js';
import { averageCases } from './report.js';

export interface RendererOptions {
  includeInput?: boolean;
  includeMetadata?: boolean;
  includeExpectedOutput?: boolean;
  includeOutput?: boolean;
  includeDurations?: boolean;
  includeTotalDuration?: boolean;
  includeAverages?: boolean;
  includeReasons?: boolean;
}

/**
 * Render an EvaluationReport as a formatted table string.
 */
export function renderTable(report: EvaluationReport, opts?: RendererOptions): string {
  const includeDurations = opts?.includeDurations ?? true;
  const includeAverages = opts?.includeAverages ?? true;

  // Determine which columns to show
  const hasScores = report.cases.some((c) => Object.keys(c.scores).length > 0);
  const hasLabels = report.cases.some((c) => Object.keys(c.labels).length > 0);
  const hasAssertions = report.cases.some((c) => Object.keys(c.assertions).length > 0);
  const hasMetrics = report.cases.some((c) => Object.keys(c.metrics).length > 0);

  // Build header
  const header: string[] = [chalk.bold('Case ID')];
  if (opts?.includeInput) header.push('Inputs');
  if (opts?.includeMetadata) header.push('Metadata');
  if (opts?.includeExpectedOutput) header.push('Expected Output');
  if (opts?.includeOutput) header.push('Output');
  if (hasScores) header.push('Scores');
  if (hasLabels) header.push('Labels');
  if (hasMetrics) header.push('Metrics');
  if (hasAssertions) header.push('Assertions');
  if (includeDurations) header.push('Duration');

  const table = new Table({
    head: header,
    style: { head: [], border: [] },
  });

  // Add rows
  for (const c of report.cases) {
    const row: string[] = [chalk.bold(c.name)];

    if (opts?.includeInput) row.push(formatValue(c.inputs));
    if (opts?.includeMetadata) row.push(formatValue(c.metadata));
    if (opts?.includeExpectedOutput) row.push(formatValue(c.expectedOutput));
    if (opts?.includeOutput) row.push(formatValue(c.output));

    if (hasScores) {
      row.push(renderScores(c));
    }
    if (hasLabels) {
      row.push(renderLabels(c));
    }
    if (hasMetrics) {
      row.push(renderMetrics(c));
    }
    if (hasAssertions) {
      row.push(renderAssertions(c, opts?.includeReasons));
    }
    if (includeDurations) {
      row.push(defaultRenderDuration(c.taskDuration));
    }

    table.push(row);
  }

  // Add averages row
  if (includeAverages && report.cases.length > 0) {
    const avg = averageCases(report.cases);
    const avgRow = buildAggregateRow(avg, {
      hasScores,
      hasLabels,
      hasMetrics,
      hasAssertions,
      includeDurations,
      includeInput: opts?.includeInput,
      includeMetadata: opts?.includeMetadata,
      includeExpectedOutput: opts?.includeExpectedOutput,
      includeOutput: opts?.includeOutput,
    });
    table.push(avgRow);
  }

  const title = `Evaluation Summary: ${report.name}`;
  return `${title}\n${table.toString()}`;
}

function buildAggregateRow(
  avg: ReportCaseAggregate,
  opts: {
    hasScores: boolean;
    hasLabels: boolean;
    hasMetrics: boolean;
    hasAssertions: boolean;
    includeDurations: boolean;
    includeInput?: boolean;
    includeMetadata?: boolean;
    includeExpectedOutput?: boolean;
    includeOutput?: boolean;
  },
): string[] {
  const row: string[] = [chalk.bold.italic('Averages')];

  if (opts.includeInput) row.push('');
  if (opts.includeMetadata) row.push('');
  if (opts.includeExpectedOutput) row.push('');
  if (opts.includeOutput) row.push('');

  if (opts.hasScores) {
    const strs = Object.entries(avg.scores).map(([k, v]) => `${k}: ${defaultRenderNumber(v)}`);
    row.push(strs.join('\n') || '-');
  }
  if (opts.hasLabels) {
    row.push('-');
  }
  if (opts.hasMetrics) {
    const strs = Object.entries(avg.metrics).map(([k, v]) => `${k}: ${defaultRenderNumber(v)}`);
    row.push(strs.join('\n') || '-');
  }
  if (opts.hasAssertions) {
    if (avg.assertions !== null) {
      row.push(`${defaultRenderPercentage(avg.assertions)} ${chalk.green('\u2714')}`);
    } else {
      row.push('-');
    }
  }
  if (opts.includeDurations) {
    row.push(defaultRenderDuration(avg.taskDuration));
  }

  return row;
}

function renderScores(c: ReportCase): string {
  const entries = Object.entries(c.scores);
  if (entries.length === 0) return '-';
  return entries.map(([k, v]) => `${k}: ${defaultRenderNumber(v.value)}`).join('\n');
}

function renderLabels(c: ReportCase): string {
  const entries = Object.entries(c.labels);
  if (entries.length === 0) return '-';
  return entries.map(([k, v]) => `${k}: ${v.value}`).join('\n');
}

function renderMetrics(c: ReportCase): string {
  const entries = Object.entries(c.metrics);
  if (entries.length === 0) return '-';
  return entries.map(([k, v]) => `${k}: ${defaultRenderNumber(v)}`).join('\n');
}

function renderAssertions(c: ReportCase, includeReasons?: boolean): string {
  const entries = Object.entries(c.assertions);
  if (entries.length === 0) return '-';

  return entries
    .map(([name, a]) => {
      const icon = a.value ? chalk.green('\u2714') : chalk.red('\u2718');
      if (includeReasons && a.reason) {
        return `${name}: ${icon}\n  Reason: ${a.reason}`;
      }
      return icon;
    })
    .join('');
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}
