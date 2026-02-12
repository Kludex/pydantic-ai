/**
 * Evaluator: base class for all case-level evaluators.
 *
 * Subclasses must implement `evaluate(ctx)` which can return
 * a value directly or a Promise.
 */

import type { EvaluatorOutput } from '../types.js';
import { BaseEvaluator } from './base.js';
import type { EvaluatorContext } from './context.js';

/**
 * Base class for all case-level evaluators.
 *
 * Evaluators assess the performance of a task as a function of the EvaluatorContext.
 * The `evaluate` method can be sync or async (just return a Promise).
 *
 * Example:
 * ```ts
 * class ExactMatch extends Evaluator {
 *   evaluate(ctx: EvaluatorContext): boolean {
 *     return ctx.output === ctx.expectedOutput;
 *   }
 * }
 * ```
 */
export abstract class Evaluator<
  TInputs = unknown,
  TOutput = unknown,
  TMetadata = unknown,
> extends BaseEvaluator {
  /**
   * Return the default name to use in reports for the output of this evaluator.
   * Can be overridden for more descriptive names.
   */
  getDefaultEvaluationName(): string {
    const evalName = (this as unknown as Record<string, unknown>).evaluationName;
    if (typeof evalName === 'string') {
      return evalName;
    }
    return this.getSerializationName();
  }

  /**
   * Evaluate the task output in the given context.
   * Can return a value directly or a Promise.
   */
  abstract evaluate(
    ctx: EvaluatorContext<TInputs, TOutput, TMetadata>,
  ): EvaluatorOutput | Promise<EvaluatorOutput>;
}
