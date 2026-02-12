/**
 * Built-in evaluators: Equals, EqualsExpected, Contains, IsInstance, MaxDuration, HasMatchingSpan.
 */

import type { EvaluationReason, EvaluationScalar } from '../types.js';
import type { EvaluatorContext } from './context.js';
import { Evaluator } from './evaluator.js';

/**
 * Check if the output exactly equals the provided value.
 */
export class Equals extends Evaluator {
  readonly value: unknown;
  readonly evaluationName: string | null;

  constructor(value: unknown, evaluationName: string | null = null) {
    super();
    this.value = value;
    this.evaluationName = evaluationName;
  }

  protected getFields() {
    return { value: this.value, evaluationName: this.evaluationName };
  }
  protected getDefaults() {
    return { evaluationName: null };
  }

  evaluate(ctx: EvaluatorContext): boolean {
    return deepStrictEqual(ctx.output, this.value);
  }
}

/**
 * Check if the output exactly equals the expected output.
 */
export class EqualsExpected extends Evaluator {
  readonly evaluationName: string | null;

  constructor(evaluationName: string | null = null) {
    super();
    this.evaluationName = evaluationName;
  }

  protected getFields() {
    return { evaluationName: this.evaluationName };
  }
  protected getDefaults() {
    return { evaluationName: null };
  }

  evaluate(ctx: EvaluatorContext): boolean | Record<string, boolean> {
    if (ctx.expectedOutput === null || ctx.expectedOutput === undefined) {
      return {};
    }
    return deepStrictEqual(ctx.output, ctx.expectedOutput);
  }
}

/**
 * Check if the output contains the expected value.
 */
export class Contains extends Evaluator {
  readonly value: unknown;
  readonly caseSensitive: boolean;
  readonly asStrings: boolean;
  readonly evaluationName: string | null;

  constructor(
    value: unknown,
    opts?: { caseSensitive?: boolean; asStrings?: boolean; evaluationName?: string | null },
  ) {
    super();
    this.value = value;
    this.caseSensitive = opts?.caseSensitive ?? true;
    this.asStrings = opts?.asStrings ?? false;
    this.evaluationName = opts?.evaluationName ?? null;
  }

  protected getFields() {
    return {
      value: this.value,
      caseSensitive: this.caseSensitive,
      asStrings: this.asStrings,
      evaluationName: this.evaluationName,
    };
  }
  protected getDefaults() {
    return { caseSensitive: true, asStrings: false, evaluationName: null };
  }

  evaluate(ctx: EvaluatorContext): EvaluationReason {
    const asStrings =
      this.asStrings || (typeof this.value === 'string' && typeof ctx.output === 'string');

    if (asStrings) {
      let outputStr = String(ctx.output);
      let expectedStr = String(this.value);

      if (!this.caseSensitive) {
        outputStr = outputStr.toLowerCase();
        expectedStr = expectedStr.toLowerCase();
      }

      if (!outputStr.includes(expectedStr)) {
        const outputTrunc = truncatedRepr(outputStr);
        const expectedTrunc = truncatedRepr(expectedStr);
        return {
          value: false,
          reason: `Output string ${outputTrunc} does not contain expected string ${expectedTrunc}`,
        };
      }
      return { value: true };
    }

    try {
      if (typeof ctx.output === 'object' && ctx.output !== null && !Array.isArray(ctx.output)) {
        const outputObj = ctx.output as Record<string, unknown>;
        if (typeof this.value === 'object' && this.value !== null && !Array.isArray(this.value)) {
          const expectedObj = this.value as Record<string, unknown>;
          for (const k of Object.keys(expectedObj)) {
            if (!(k in outputObj)) {
              return {
                value: false,
                reason: `Output dictionary does not contain expected key ${truncatedRepr(k, 30)}`,
              };
            }
            if (!deepStrictEqual(outputObj[k], expectedObj[k])) {
              return {
                value: false,
                reason: `Output dictionary has different value for key ${truncatedRepr(k, 30)}: ${truncatedRepr(String(outputObj[k]))} != ${truncatedRepr(String(expectedObj[k]))}`,
              };
            }
          }
          return { value: true };
        }

        // Check if value is a key
        if (typeof this.value === 'string' && this.value in outputObj) {
          return { value: true };
        }
        return {
          value: false,
          reason: `Output ${truncatedRepr(String(ctx.output), 200)} does not contain provided value as a key`,
        };
      }

      if (Array.isArray(ctx.output)) {
        const found = ctx.output.some((item) => deepStrictEqual(item, this.value));
        if (!found) {
          return {
            value: false,
            reason: `Output ${truncatedRepr(String(ctx.output), 200)} does not contain provided value`,
          };
        }
        return { value: true };
      }

      return {
        value: false,
        reason: `Containment check failed: output is not a container type`,
      };
      /* v8 ignore next 6 -- defensive: only reachable if deepStrictEqual throws */
    } catch (e) {
      return {
        value: false,
        reason: `Containment check failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
}

/**
 * Check if the output is an instance of a type with the given name.
 * In TypeScript, this checks the constructor name up the prototype chain.
 */
export class IsInstance extends Evaluator {
  readonly typeName: string;
  readonly evaluationName: string | null;

  constructor(typeName: string, evaluationName: string | null = null) {
    super();
    this.typeName = typeName;
    this.evaluationName = evaluationName;
  }

  protected getFields() {
    return { typeName: this.typeName, evaluationName: this.evaluationName };
  }
  protected getDefaults() {
    return { evaluationName: null };
  }

  evaluate(ctx: EvaluatorContext): EvaluationReason {
    const output = ctx.output;
    if (output === null || output === undefined) {
      return { value: false, reason: `output is ${String(output)}` };
    }

    // Walk the prototype chain
    let proto = Object.getPrototypeOf(output) as { constructor?: { name?: string } } | null;
    while (proto) {
      if (proto.constructor?.name === this.typeName) {
        return { value: true };
      }
      proto = Object.getPrototypeOf(proto) as { constructor?: { name?: string } } | null;
    }

    // Check typeof for primitives
    const typeName = typeof output;
    if (typeName === this.typeName || (this.typeName === 'Array' && Array.isArray(output))) {
      return { value: true };
    }

    const actualType = output?.constructor?.name ?? typeof output;
    return { value: false, reason: `output is of type ${actualType}` };
  }
}

/**
 * Check if the execution time is under the specified maximum.
 */
export class MaxDuration extends Evaluator {
  /** Maximum duration in seconds. */
  readonly seconds: number;

  constructor(seconds: number) {
    super();
    this.seconds = seconds;
  }

  protected getFields() {
    return { seconds: this.seconds };
  }

  evaluate(ctx: EvaluatorContext): boolean {
    return ctx.duration <= this.seconds;
  }
}

/**
 * Check if the span tree contains a span matching the given query.
 */
export class HasMatchingSpan extends Evaluator {
  readonly query: Record<string, unknown>;
  readonly evaluationName: string | null;

  constructor(query: Record<string, unknown>, evaluationName: string | null = null) {
    super();
    this.query = query;
    this.evaluationName = evaluationName;
  }

  protected getFields() {
    return { query: this.query, evaluationName: this.evaluationName };
  }
  protected getDefaults() {
    return { evaluationName: null };
  }

  evaluate(ctx: EvaluatorContext): boolean {
    return ctx.spanTree.any(this.query);
  }
}

/** All built-in evaluator types, for the evaluator registry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DEFAULT_EVALUATORS: (new (...args: any[]) => Evaluator)[] = [
  Equals,
  EqualsExpected,
  Contains,
  IsInstance,
  MaxDuration,
  HasMatchingSpan,
];

// -- Helpers --

function truncatedRepr(value: string, maxLength = 100): string {
  const repr = JSON.stringify(value);
  if (repr.length > maxLength) {
    const half = Math.floor(maxLength / 2);
    return `${repr.slice(0, half)}...${repr.slice(-half)}`;
  }
  return repr;
}

function deepStrictEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepStrictEqual(val, b[i]));
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj).sort();
  const bKeys = Object.keys(bObj).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, i) => key === bKeys[i] && deepStrictEqual(aObj[key], bObj[key]));
}

/**
 * LLMJudge output config (used by llm-judge.ts).
 */
export interface OutputConfig {
  evaluationName?: string;
  includeReason?: boolean;
}

/**
 * Helper to update a combined output dict for LLMJudge.
 */
export function updateCombinedOutput(
  combinedOutput: Record<string, EvaluationScalar | EvaluationReason>,
  value: boolean | number | string,
  reason: string | null,
  config: OutputConfig,
  defaultName: string,
): void {
  const name = config.evaluationName ?? defaultName;
  if (config.includeReason && reason != null) {
    combinedOutput[name] = { value, reason };
  } else {
    combinedOutput[name] = value;
  }
}
