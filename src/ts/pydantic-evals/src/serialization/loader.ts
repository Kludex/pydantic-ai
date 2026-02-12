/**
 * YAML/JSON loading and saving for datasets.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import YAML from 'yaml';
import type { z } from 'zod';
import { type Case, Dataset } from '../dataset.js';
import type { BaseEvaluator } from '../evaluators/base.js';
import { DEFAULT_EVALUATORS } from '../evaluators/common.js';
import type { Evaluator } from '../evaluators/evaluator.js';
import { DEFAULT_REPORT_EVALUATORS } from '../evaluators/report-common.js';
import type { ReportEvaluator } from '../evaluators/report-evaluator.js';
import { deserializeEvaluatorSpec, serializeEvaluatorSpec } from '../evaluators/spec.js';
import type { EvaluatorSpec } from '../types.js';
import { type datasetSchema, defaultDatasetSchema } from './schema.js';

type EvaluatorClass = typeof Evaluator & { new (...args: unknown[]): Evaluator };
type ReportEvaluatorClass = typeof ReportEvaluator & { new (...args: unknown[]): ReportEvaluator };

/**
 * Registry entry: maps a serialization name to a factory function.
 */
export interface EvaluatorRegistryEntry {
  name: string;
  create: (args: unknown[], kwargs: Record<string, unknown>) => BaseEvaluator;
}

export interface LoadOptions<
  TInputs extends z.ZodType = z.ZodUnknown,
  TOutput extends z.ZodType = z.ZodUnknown,
  TMetadata extends z.ZodType = z.ZodUnknown,
> {
  /** Zod schema for validating the dataset file. Defaults to z.unknown() for all types. */
  schema?: ReturnType<typeof datasetSchema<TInputs, TOutput, TMetadata>>;
  /** Custom evaluator classes for deserialization. */
  customEvaluatorTypes?: EvaluatorClass[];
  /** Custom report evaluator classes for deserialization. */
  customReportEvaluatorTypes?: ReportEvaluatorClass[];
  /** File format. If not specified, inferred from file extension. */
  fmt?: 'yaml' | 'json';
}

/**
 * Load a Dataset from a file.
 */
export function loadDatasetFromFile<TInputs = unknown, TOutput = unknown, TMetadata = unknown>(
  path: string,
  opts?: LoadOptions,
): Dataset<TInputs, TOutput, TMetadata> {
  const fmt = opts?.fmt ?? inferFormat(path);
  const content = readFileSync(path, 'utf-8');
  return loadDatasetFromText(content, { ...opts, fmt, defaultName: stemOf(path) });
}

/**
 * Load a Dataset from a string.
 */
export function loadDatasetFromText<TInputs = unknown, TOutput = unknown, TMetadata = unknown>(
  content: string,
  opts?: LoadOptions & { fmt?: 'yaml' | 'json'; defaultName?: string },
): Dataset<TInputs, TOutput, TMetadata> {
  const fmt = opts?.fmt ?? 'yaml';
  const raw = fmt === 'yaml' ? YAML.parse(content) : JSON.parse(content);
  return loadDatasetFromObject(raw, opts);
}

/**
 * Load a Dataset from a plain object (after parsing YAML/JSON).
 */
export function loadDatasetFromObject<TInputs = unknown, TOutput = unknown, TMetadata = unknown>(
  data: unknown,
  opts?: LoadOptions & { defaultName?: string },
): Dataset<TInputs, TOutput, TMetadata> {
  const schema = opts?.schema ?? defaultDatasetSchema;
  const parsed = schema.parse(data);

  // Build evaluator registries
  const evaluatorRegistry = buildRegistry(
    opts?.customEvaluatorTypes ?? [],
    DEFAULT_EVALUATORS as unknown as EvaluatorClass[],
  );
  const reportEvaluatorRegistry = buildRegistry(
    opts?.customReportEvaluatorTypes ?? [],
    DEFAULT_REPORT_EVALUATORS as unknown as ReportEvaluatorClass[],
  );

  // Load dataset-level evaluators
  const datasetEvaluators: Evaluator[] = [];
  for (const rawSpec of parsed.evaluators ?? []) {
    const spec = deserializeEvaluatorSpec(rawSpec);
    datasetEvaluators.push(loadEvaluatorFromRegistry(evaluatorRegistry, spec) as Evaluator);
  }

  // Load report evaluators
  const reportEvaluators: ReportEvaluator[] = [];
  for (const rawSpec of parsed.report_evaluators ?? []) {
    const spec = deserializeEvaluatorSpec(rawSpec);
    reportEvaluators.push(
      loadEvaluatorFromRegistry(reportEvaluatorRegistry, spec) as ReportEvaluator,
    );
  }

  // Load cases
  const cases: Case<TInputs, TOutput, TMetadata>[] = [];
  for (const row of parsed.cases) {
    const caseEvaluators: Evaluator[] = [];
    for (const rawSpec of row.evaluators ?? []) {
      const spec = deserializeEvaluatorSpec(rawSpec);
      caseEvaluators.push(loadEvaluatorFromRegistry(evaluatorRegistry, spec) as Evaluator);
    }

    cases.push({
      name: row.name ?? undefined,
      inputs: row.inputs as TInputs,
      metadata: (row.metadata ?? null) as TMetadata | null,
      expectedOutput: (row.expected_output ?? null) as TOutput | null,
      evaluators: caseEvaluators.length > 0 ? caseEvaluators : undefined,
    });
  }

  const dataset = new Dataset<TInputs, TOutput, TMetadata>({
    name: parsed.name ?? opts?.defaultName ?? null,
    cases,
    evaluators: datasetEvaluators,
    reportEvaluators,
  });

  return dataset;
}

/**
 * Save a Dataset to a file.
 */
export function saveDatasetToFile(
  dataset: Dataset,
  path: string,
  opts?: { fmt?: 'yaml' | 'json' },
): void {
  const fmt = opts?.fmt ?? inferFormat(path);
  const data = serializeDataset(dataset);

  if (fmt === 'yaml') {
    const content = YAML.stringify(data, { sortMapEntries: false });
    writeFileSync(path, content, 'utf-8');
  } else {
    const content = `${JSON.stringify(data, null, 2)}\n`;
    writeFileSync(path, content, 'utf-8');
  }
}

function serializeDataset(dataset: Dataset): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (dataset.name) data.name = dataset.name;

  data.cases = dataset.cases.map((c) => {
    const caseData: Record<string, unknown> = {};
    if (c.name) caseData.name = c.name;
    caseData.inputs = c.inputs;
    if (c.metadata != null) caseData.metadata = c.metadata;
    if (c.expectedOutput != null) caseData.expected_output = c.expectedOutput;
    if (c.evaluators && c.evaluators.length > 0) {
      caseData.evaluators = c.evaluators.map((ev) => serializeEvaluatorSpec(ev.asSpec()));
    }
    return caseData;
  });

  if (dataset.evaluators.length > 0) {
    data.evaluators = dataset.evaluators.map((ev) => serializeEvaluatorSpec(ev.asSpec()));
  }

  if (dataset.reportEvaluators.length > 0) {
    data.report_evaluators = dataset.reportEvaluators.map((ev) =>
      serializeEvaluatorSpec(ev.asSpec()),
    );
  }

  return data;
}

// -- Registry helpers --

function buildRegistry(
  customTypes: (EvaluatorClass | ReportEvaluatorClass)[],
  defaults: (EvaluatorClass | ReportEvaluatorClass)[],
): Map<string, EvaluatorClass | ReportEvaluatorClass> {
  const registry = new Map<string, EvaluatorClass | ReportEvaluatorClass>();

  for (const cls of customTypes) {
    const name = cls.getSerializationName();
    if (registry.has(name)) {
      throw new Error(`Duplicate evaluator class name: '${name}'`);
    }
    registry.set(name, cls);
  }

  for (const cls of defaults) {
    const name = cls.getSerializationName();
    if (!registry.has(name)) {
      registry.set(name, cls);
    }
  }

  return registry;
}

function loadEvaluatorFromRegistry(
  registry: Map<string, EvaluatorClass | ReportEvaluatorClass>,
  spec: EvaluatorSpec,
): BaseEvaluator {
  const cls = registry.get(spec.name);
  if (!cls) {
    throw new Error(
      `Evaluator '${spec.name}' is not in the registry. ` +
        `Valid choices: ${[...registry.keys()].join(', ')}. ` +
        `If using a custom evaluator, include its class in customEvaluatorTypes.`,
    );
  }

  try {
    if (spec.arguments === null) {
      return new (cls as new () => BaseEvaluator)();
    }
    if (Array.isArray(spec.arguments)) {
      return new (cls as new (...args: unknown[]) => BaseEvaluator)(...spec.arguments);
    }
    // kwargs — pass as a single options object
    return new (cls as new (opts: Record<string, unknown>) => BaseEvaluator)(spec.arguments);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    throw new Error(`Failed to instantiate evaluator '${spec.name}': ${error.message}`);
  }
}

// -- Utilities --

function inferFormat(path: string): 'yaml' | 'json' {
  const ext = extname(path).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  if (ext === '.json') return 'json';
  throw new Error(
    `Could not infer format for filename '${basename(path)}'. Use the fmt option to specify the format.`,
  );
}

function stemOf(path: string): string {
  const base = basename(path);
  const ext = extname(base);
  return base.slice(0, base.length - ext.length);
}
