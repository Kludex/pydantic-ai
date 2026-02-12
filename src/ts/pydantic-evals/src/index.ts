/**
 * pydantic-evals TypeScript port: evaluation framework for stochastic functions.
 *
 * @example
 * ```ts
 * import { Dataset, Case, Evaluator, EvaluatorContext } from 'pydantic-evals';
 *
 * class ExactMatch extends Evaluator {
 *   evaluate(ctx: EvaluatorContext): boolean {
 *     return ctx.output === ctx.expectedOutput;
 *   }
 * }
 *
 * const dataset = new Dataset({
 *   cases: [
 *     { name: 'test1', inputs: 'hello', expectedOutput: 'HELLO' },
 *     { name: 'test2', inputs: 'world', expectedOutput: 'WORLD' },
 *   ],
 *   evaluators: [new ExactMatch()],
 * });
 *
 * const report = await dataset.evaluate((input: string) => input.toUpperCase());
 * report.print();
 * ```
 */

export type { Case, DatasetOptions, EvaluateOptions } from './dataset.js';
// Dataset and Case
export { Dataset, incrementEvalMetric, setEvalAttribute } from './dataset.js';
export type {
  EvaluatorContext,
  GradingOutput,
  OutputConfig,
  ReportEvaluatorContext,
} from './evaluators/index.js';
// Evaluators
export {
  BaseEvaluator,
  ConfusionMatrixEvaluator,
  Contains,
  createEvaluatorContext,
  deserializeEvaluatorSpec,
  Equals,
  EqualsExpected,
  Evaluator,
  getDefaultJudgeModel,
  HasMatchingSpan,
  IsInstance,
  LLMJudge,
  MaxDuration,
  PrecisionRecallEvaluator,
  ReportEvaluator,
  runEvaluator,
  serializeEvaluatorSpec,
  setDefaultJudgeModel,
} from './evaluators/index.js';
export type { AttributeValue, SpanPredicate, SpanQuery } from './otel/index.js';
// OTel
export {
  SpanNode,
  SpanTree,
  SpanTreeRecordingError,
  withSpanCapture,
} from './otel/index.js';
// Reporting
export type {
  ConfusionMatrix,
  EvaluationReport,
  PrecisionRecall,
  RenderOptions,
  ReportAnalysis,
  ReportCase,
  ReportCaseAggregate,
  ReportCaseFailure,
  ReportCaseGroup,
  ScalarResult,
  TableResult,
} from './reporting/index.js';
export {
  averageCases,
  averageFromAggregates,
  createEvaluationReport,
  createReportCase,
  createReportCaseFailure,
  defaultRenderDuration,
  defaultRenderDurationDiff,
  defaultRenderNumber,
  defaultRenderNumberDiff,
  defaultRenderPercentage,
  renderTable,
} from './reporting/index.js';
export type { LoadOptions } from './serialization/index.js';
// Serialization
export {
  caseSchema,
  datasetSchema,
  evaluatorSpecSchema,
  loadDatasetFromFile,
  loadDatasetFromObject,
  loadDatasetFromText,
  saveDatasetToFile,
} from './serialization/index.js';
// Core types
export type {
  EvaluationReason,
  EvaluationResult,
  EvaluationScalar,
  EvaluatorFailure,
  EvaluatorOutput,
  EvaluatorSpec,
} from './types.js';
export { downcastResult, isEvaluationReason, isEvaluationScalar } from './types.js';
