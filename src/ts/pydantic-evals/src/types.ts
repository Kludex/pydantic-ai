/**
 * Core type definitions for pydantic-evals TypeScript port.
 */

/**
 * The most primitive output allowed from an Evaluator.
 * `number` covers int/float, `string` as labels, `boolean` as assertions.
 */
export type EvaluationScalar = boolean | number | string;

/**
 * The result of running an evaluator with an optional explanation.
 */
export interface EvaluationReason {
  value: EvaluationScalar;
  reason?: string | null;
}

/**
 * Type for the output of an evaluator.
 * Can be a scalar, an EvaluationReason, or a mapping of names to either.
 */
export type EvaluatorOutput =
  | EvaluationScalar
  | EvaluationReason
  | Record<string, EvaluationScalar | EvaluationReason>;

/**
 * The details of an individual evaluation result.
 */
export interface EvaluationResult<T extends EvaluationScalar = EvaluationScalar> {
  name: string;
  value: T;
  reason: string | null;
  source: EvaluatorSpec;
}

/**
 * Represents a failure raised during the execution of an evaluator.
 */
export interface EvaluatorFailure {
  name: string;
  errorMessage: string;
  errorStacktrace: string;
  source: EvaluatorSpec;
}

/**
 * The specification of an evaluator to be run (serializable format).
 */
export interface EvaluatorSpec {
  name: string;
  arguments: null | [unknown] | Record<string, unknown>;
}

/**
 * Helper to check if a value is an EvaluationReason (has a `value` property).
 */
export function isEvaluationReason(v: unknown): v is EvaluationReason {
  return (
    typeof v === 'object' &&
    v !== null &&
    'value' in v &&
    (typeof (v as EvaluationReason).value === 'boolean' ||
      typeof (v as EvaluationReason).value === 'number' ||
      typeof (v as EvaluationReason).value === 'string')
  );
}

/**
 * Helper to check if a value is an EvaluationScalar.
 */
export function isEvaluationScalar(v: unknown): v is EvaluationScalar {
  return typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string';
}

/**
 * Attempt to downcast an EvaluationResult to a more specific type.
 * Returns null if the value doesn't match the target type.
 */
export function downcastResult<T extends EvaluationScalar>(
  result: EvaluationResult,
  ...valueTypes: string[]
): EvaluationResult<T> | null {
  for (const valueType of valueTypes) {
    if (typeof result.value === valueType) {
      return result as EvaluationResult<T>;
    }
  }
  return null;
}
