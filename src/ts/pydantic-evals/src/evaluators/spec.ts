/**
 * EvaluatorSpec: serializable specification for evaluators.
 *
 * Supports various short forms for YAML/JSON dataset files:
 * - `'MyEvaluator'` — no arguments
 * - `{ MyEvaluator: firstArg }` — single positional argument
 * - `{ MyEvaluator: { k1: v1, k2: v2 } }` — keyword arguments
 */

import type { EvaluatorSpec } from '../types.js';

/**
 * Get positional args from the spec.
 */
export function specArgs(spec: EvaluatorSpec): unknown[] {
  if (Array.isArray(spec.arguments)) {
    return spec.arguments;
  }
  return [];
}

/**
 * Get keyword args from the spec.
 */
export function specKwargs(spec: EvaluatorSpec): Record<string, unknown> {
  if (
    spec.arguments !== null &&
    !Array.isArray(spec.arguments) &&
    typeof spec.arguments === 'object'
  ) {
    return spec.arguments;
  }
  return {};
}

/**
 * Deserialize a raw value (from YAML/JSON) into an EvaluatorSpec.
 *
 * Handles the short forms:
 * - `'MyEvaluator'` → { name: 'MyEvaluator', arguments: null }
 * - `{ MyEvaluator: value }` → single positional arg
 * - `{ MyEvaluator: { k1: v1 } }` → kwargs (when value is a plain object with string keys)
 */
export function deserializeEvaluatorSpec(value: unknown): EvaluatorSpec {
  if (typeof value === 'string') {
    return { name: value, arguments: null };
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length !== 1) {
      throw new Error(
        `Expected a single key containing the Evaluator class name, found keys ${JSON.stringify(keys)}`,
      );
    }

    const name = keys[0]!;
    const rawValue = (value as Record<string, unknown>)[name];

    if (rawValue === undefined || rawValue === null) {
      return { name, arguments: null };
    }

    // If the value is a plain object with string keys, treat as kwargs
    if (isPlainObject(rawValue)) {
      return { name, arguments: rawValue as Record<string, unknown> };
    }

    // Otherwise treat as a single positional argument
    return { name, arguments: [rawValue] };
  }

  throw new Error(`Invalid evaluator spec: ${JSON.stringify(value)}`);
}

/**
 * Serialize an EvaluatorSpec to its short form for YAML/JSON.
 */
export function serializeEvaluatorSpec(spec: EvaluatorSpec, useShortForm = true): unknown {
  if (!useShortForm) {
    return spec;
  }

  if (spec.arguments === null) {
    return spec.name;
  }

  if (Array.isArray(spec.arguments)) {
    return { [spec.name]: spec.arguments[0] };
  }

  return { [spec.name]: spec.arguments };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.keys(value).every((k) => typeof k === 'string');
}
