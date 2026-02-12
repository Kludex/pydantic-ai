/**
 * Shared serialization base for Evaluator and ReportEvaluator.
 */

import type { EvaluatorSpec } from '../types.js';

/**
 * Base class providing serialization, spec-building, and repr logic.
 * All evaluator classes should extend this.
 */
export abstract class BaseEvaluator {
  /**
   * Return the 'name' of this evaluator to use during serialization.
   * Defaults to the constructor name.
   */
  static getSerializationName(): string {
    // biome-ignore lint/complexity/noThisInStatic: `this` refers to the subclass, not BaseEvaluator
    return this.name;
  }

  /** Instance helper that delegates to the static method. */
  getSerializationName(): string {
    return (this.constructor as typeof BaseEvaluator).getSerializationName();
  }

  /**
   * Return the fields that define this evaluator instance.
   * Override in subclasses to provide constructor args for serialization.
   * Should return a map of field name -> value.
   */
  protected getFields(): Record<string, unknown> {
    return {};
  }

  /**
   * Return the default values for the fields.
   * Override in subclasses.
   */
  protected getDefaults(): Record<string, unknown> {
    return {};
  }

  /**
   * Build the serialization arguments, excluding fields at their default values.
   */
  buildSerializationArguments(): Record<string, unknown> {
    const fields = this.getFields();
    const defaults = this.getDefaults();
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(fields)) {
      if (key in defaults && deepEqual(value, defaults[key])) {
        continue;
      }
      result[key] = value;
    }
    return result;
  }

  /**
   * Convert this evaluator to an EvaluatorSpec.
   */
  asSpec(): EvaluatorSpec {
    const rawArguments = this.buildSerializationArguments();
    const keys = Object.keys(rawArguments);

    if (keys.length === 0) {
      return { name: this.getSerializationName(), arguments: null };
    }

    if (keys.length === 1) {
      // Only use compact tuple form if the single field is the first field
      const fieldNames = Object.keys(this.getFields());
      const firstFieldName = fieldNames[0];
      const key = keys[0]!;
      if (key === firstFieldName) {
        return { name: this.getSerializationName(), arguments: [rawArguments[key]] };
      }
      return { name: this.getSerializationName(), arguments: rawArguments };
    }

    return { name: this.getSerializationName(), arguments: rawArguments };
  }

  toString(): string {
    const args = this.buildSerializationArguments();
    const argStr = Object.entries(args)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    return `${this.getSerializationName()}(${argStr})`;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  if (Array.isArray(a) || Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}
