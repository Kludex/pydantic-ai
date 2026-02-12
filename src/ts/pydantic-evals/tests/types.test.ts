import { describe, expect, it } from 'vitest';
import {
  downcastResult,
  type EvaluationResult,
  type EvaluatorSpec,
  isEvaluationReason,
  isEvaluationScalar,
} from '../src/types.js';

describe('isEvaluationScalar', () => {
  it('returns true for booleans', () => {
    expect(isEvaluationScalar(true)).toBe(true);
    expect(isEvaluationScalar(false)).toBe(true);
  });

  it('returns true for numbers', () => {
    expect(isEvaluationScalar(0)).toBe(true);
    expect(isEvaluationScalar(3.14)).toBe(true);
    expect(isEvaluationScalar(-1)).toBe(true);
  });

  it('returns true for strings', () => {
    expect(isEvaluationScalar('')).toBe(true);
    expect(isEvaluationScalar('hello')).toBe(true);
  });

  it('returns false for non-scalars', () => {
    expect(isEvaluationScalar(null)).toBe(false);
    expect(isEvaluationScalar(undefined)).toBe(false);
    expect(isEvaluationScalar({})).toBe(false);
    expect(isEvaluationScalar([])).toBe(false);
    expect(isEvaluationScalar({ value: true })).toBe(false);
  });
});

describe('isEvaluationReason', () => {
  it('returns true for objects with boolean value', () => {
    expect(isEvaluationReason({ value: true })).toBe(true);
    expect(isEvaluationReason({ value: false })).toBe(true);
  });

  it('returns true for objects with number value', () => {
    expect(isEvaluationReason({ value: 42 })).toBe(true);
  });

  it('returns true for objects with string value', () => {
    expect(isEvaluationReason({ value: 'label' })).toBe(true);
  });

  it('returns true for objects with value and reason', () => {
    expect(isEvaluationReason({ value: false, reason: 'nope' })).toBe(true);
  });

  it('returns false for scalars', () => {
    expect(isEvaluationReason(true)).toBe(false);
    expect(isEvaluationReason(42)).toBe(false);
    expect(isEvaluationReason('hello')).toBe(false);
  });

  it('returns false for objects without value', () => {
    expect(isEvaluationReason({})).toBe(false);
    expect(isEvaluationReason({ reason: 'no value' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isEvaluationReason(null)).toBe(false);
    expect(isEvaluationReason(undefined)).toBe(false);
  });

  it('returns false for objects where value is not a scalar', () => {
    expect(isEvaluationReason({ value: {} })).toBe(false);
    expect(isEvaluationReason({ value: [] })).toBe(false);
    expect(isEvaluationReason({ value: null })).toBe(false);
  });
});

describe('downcastResult', () => {
  const spec: EvaluatorSpec = { name: 'test', arguments: null };

  it('downcasts boolean results', () => {
    const result: EvaluationResult = { name: 'a', value: true, reason: null, source: spec };
    const downcasted = downcastResult<boolean>(result, 'boolean');
    expect(downcasted).not.toBeNull();
    expect(downcasted!.value).toBe(true);
  });

  it('downcasts number results', () => {
    const result: EvaluationResult = { name: 'a', value: 0.95, reason: null, source: spec };
    const downcasted = downcastResult<number>(result, 'number');
    expect(downcasted).not.toBeNull();
    expect(downcasted!.value).toBe(0.95);
  });

  it('downcasts string results', () => {
    const result: EvaluationResult = { name: 'a', value: 'cat', reason: null, source: spec };
    const downcasted = downcastResult<string>(result, 'string');
    expect(downcasted).not.toBeNull();
    expect(downcasted!.value).toBe('cat');
  });

  it('returns null for type mismatch', () => {
    const result: EvaluationResult = { name: 'a', value: true, reason: null, source: spec };
    expect(downcastResult<number>(result, 'number')).toBeNull();
    expect(downcastResult<string>(result, 'string')).toBeNull();
  });

  it('boolean not matched by non-boolean type', () => {
    const result: EvaluationResult = { name: 'a', value: true, reason: null, source: spec };
    expect(downcastResult<number>(result, 'number')).toBeNull();
  });

  it('supports multiple value types', () => {
    const numResult: EvaluationResult = { name: 'a', value: 42, reason: null, source: spec };
    expect(downcastResult(numResult, 'number', 'string')).not.toBeNull();

    const strResult: EvaluationResult = { name: 'a', value: 'x', reason: null, source: spec };
    expect(downcastResult(strResult, 'number', 'string')).not.toBeNull();

    const boolResult: EvaluationResult = { name: 'a', value: true, reason: null, source: spec };
    expect(downcastResult(boolResult, 'number', 'string')).toBeNull();
  });
});
