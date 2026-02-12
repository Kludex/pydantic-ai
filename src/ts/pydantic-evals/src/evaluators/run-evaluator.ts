/**
 * Run an evaluator and return normalized results.
 */

import type {
  EvaluationReason,
  EvaluationResult,
  EvaluationScalar,
  EvaluatorFailure,
  EvaluatorOutput,
} from '../types.js';
import { isEvaluationReason, isEvaluationScalar } from '../types.js';
import type { EvaluatorContext } from './context.js';
import type { Evaluator } from './evaluator.js';

/**
 * Run an evaluator on the given context and normalize the results.
 *
 * Returns a list of evaluation results, or an evaluator failure if
 * an exception is raised during execution.
 */
export async function runEvaluator(
  evaluator: Evaluator,
  ctx: EvaluatorContext,
): Promise<EvaluationResult[] | EvaluatorFailure> {
  try {
    const rawResults = await evaluator.evaluate(ctx);
    const results = normalizeToMapping(rawResults, evaluator.getDefaultEvaluationName());

    const details: EvaluationResult[] = [];
    for (const [name, result] of Object.entries(results)) {
      let value: EvaluationScalar;
      let reason: string | null = null;

      if (isEvaluationReason(result)) {
        value = result.value;
        reason = result.reason ?? null;
      } else {
        value = result;
      }

      details.push({
        name,
        value,
        reason,
        source: evaluator.asSpec(),
      });
    }

    return details;
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return {
      name: evaluator.getDefaultEvaluationName(),
      errorMessage: `${error.name}: ${error.message}`,
      errorStacktrace: error.stack /* v8 ignore next */ ?? '',
      source: evaluator.asSpec(),
    };
  }
}

function normalizeToMapping(
  result: EvaluatorOutput,
  scalarName: string,
): Record<string, EvaluationScalar | EvaluationReason> {
  if (isEvaluationScalar(result) || isEvaluationReason(result)) {
    return { [scalarName]: result };
  }
  // Must be a Record
  return result as Record<string, EvaluationScalar | EvaluationReason>;
}
