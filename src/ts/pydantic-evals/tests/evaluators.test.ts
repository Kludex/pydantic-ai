import { describe, expect, it } from 'vitest';
import {
  Contains,
  Equals,
  EqualsExpected,
  HasMatchingSpan,
  IsInstance,
  MaxDuration,
  updateCombinedOutput,
} from '../src/evaluators/common.js';
import { createEvaluatorContext } from '../src/evaluators/context.js';
import { Evaluator } from '../src/evaluators/evaluator.js';
import { runEvaluator } from '../src/evaluators/run-evaluator.js';
import {
  deserializeEvaluatorSpec,
  serializeEvaluatorSpec,
  specArgs,
  specKwargs,
} from '../src/evaluators/spec.js';
import { SpanNode, SpanTree } from '../src/otel/span-tree.js';
import type { EvaluationReason, EvaluationScalar, EvaluatorOutput } from '../src/types.js';

// -- Helper to build context for tests --
function makeCtx(overrides: Partial<Parameters<typeof createEvaluatorContext>[0]> = {}) {
  return createEvaluatorContext({
    name: 'test',
    inputs: 'inputs' in overrides ? overrides.inputs! : 'input',
    metadata: 'metadata' in overrides ? overrides.metadata! : null,
    expectedOutput: 'expectedOutput' in overrides ? overrides.expectedOutput! : null,
    output: 'output' in overrides ? overrides.output! : 'output',
    duration: overrides.duration ?? 1.0,
    attributes: overrides.attributes ?? {},
    metrics: overrides.metrics ?? {},
    spanTreeOrError: overrides.spanTreeOrError ?? new SpanTree(),
  });
}

// ============ Evaluator Serialization ============

describe('BaseEvaluator serialization', () => {
  it('Equals serializes to spec with positional arg', () => {
    const ev = new Equals(42);
    const spec = ev.asSpec();
    expect(spec.name).toBe('Equals');
    expect(spec.arguments).toEqual([42]);
  });

  it('Equals with evaluationName serializes to kwargs', () => {
    const ev = new Equals(42, 'my_check');
    const spec = ev.asSpec();
    expect(spec.name).toBe('Equals');
    expect(spec.arguments).toEqual({ value: 42, evaluationName: 'my_check' });
  });

  it('EqualsExpected with no args serializes to null arguments', () => {
    const ev = new EqualsExpected();
    const spec = ev.asSpec();
    expect(spec.name).toBe('EqualsExpected');
    expect(spec.arguments).toBeNull();
  });

  it('EqualsExpected with evaluationName serializes with single non-first-field kwarg', () => {
    const ev = new EqualsExpected('custom');
    const spec = ev.asSpec();
    expect(spec.name).toBe('EqualsExpected');
    // evaluationName is the first field, so it should be positional
    expect(spec.arguments).toEqual(['custom']);
  });

  it('MaxDuration serializes with positional arg', () => {
    const ev = new MaxDuration(5);
    const spec = ev.asSpec();
    expect(spec.name).toBe('MaxDuration');
    expect(spec.arguments).toEqual([5]);
  });

  it('Contains serializes with non-default kwargs', () => {
    const ev = new Contains('hello', { caseSensitive: false, asStrings: true });
    const spec = ev.asSpec();
    expect(spec.name).toBe('Contains');
    expect(spec.arguments).toEqual({ value: 'hello', caseSensitive: false, asStrings: true });
  });

  it('toString() provides human-readable output', () => {
    const ev = new Equals(42);
    expect(ev.toString()).toBe('Equals(value=42)');
  });

  it('toString() with no args', () => {
    const ev = new EqualsExpected();
    expect(ev.toString()).toBe('EqualsExpected()');
  });

  it('getDefaultEvaluationName uses class name by default', () => {
    const ev = new EqualsExpected();
    expect(ev.getDefaultEvaluationName()).toBe('EqualsExpected');
  });

  it('getDefaultEvaluationName uses evaluationName field if set', () => {
    const ev = new EqualsExpected('custom_name');
    expect(ev.getDefaultEvaluationName()).toBe('custom_name');
  });

  it('getSerializationName static method works', () => {
    expect(Equals.getSerializationName()).toBe('Equals');
    expect(EqualsExpected.getSerializationName()).toBe('EqualsExpected');
  });

  it('buildSerializationArguments excludes default values', () => {
    const ev = new Contains('test');
    const args = ev.buildSerializationArguments();
    expect(args).toEqual({ value: 'test' });
    expect(args).not.toHaveProperty('caseSensitive');
    expect(args).not.toHaveProperty('asStrings');
  });
});

// ============ EvaluatorSpec ============

describe('deserializeEvaluatorSpec', () => {
  it('deserializes string to no-arg spec', () => {
    const spec = deserializeEvaluatorSpec('EqualsExpected');
    expect(spec).toEqual({ name: 'EqualsExpected', arguments: null });
  });

  it('deserializes object with scalar value to positional arg', () => {
    const spec = deserializeEvaluatorSpec({ Equals: 42 });
    expect(spec).toEqual({ name: 'Equals', arguments: [42] });
  });

  it('deserializes object with array value to positional arg', () => {
    const spec = deserializeEvaluatorSpec({ Equals: [1, 2, 3] });
    expect(spec).toEqual({ name: 'Equals', arguments: [[1, 2, 3]] });
  });

  it('deserializes object with object value to kwargs', () => {
    const spec = deserializeEvaluatorSpec({ Contains: { value: 'hello', caseSensitive: false } });
    expect(spec).toEqual({
      name: 'Contains',
      arguments: { value: 'hello', caseSensitive: false },
    });
  });

  it('deserializes object with null to no-arg spec', () => {
    const spec = deserializeEvaluatorSpec({ Equals: null });
    expect(spec).toEqual({ name: 'Equals', arguments: null });
  });

  it('deserializes object with undefined to no-arg spec', () => {
    const spec = deserializeEvaluatorSpec({ Equals: undefined });
    expect(spec).toEqual({ name: 'Equals', arguments: null });
  });

  it('throws on multiple keys', () => {
    expect(() => deserializeEvaluatorSpec({ A: 1, B: 2 })).toThrow('single key');
  });

  it('throws on non-string, non-object value', () => {
    expect(() => deserializeEvaluatorSpec(42)).toThrow('Invalid evaluator spec');
  });

  it('throws on array input', () => {
    expect(() => deserializeEvaluatorSpec([1, 2])).toThrow('Invalid evaluator spec');
  });
});

describe('serializeEvaluatorSpec', () => {
  it('serializes no-arg spec to string', () => {
    expect(serializeEvaluatorSpec({ name: 'Foo', arguments: null })).toBe('Foo');
  });

  it('serializes positional arg to object', () => {
    expect(serializeEvaluatorSpec({ name: 'Foo', arguments: [42] })).toEqual({ Foo: 42 });
  });

  it('serializes kwargs to object', () => {
    expect(serializeEvaluatorSpec({ name: 'Foo', arguments: { a: 1, b: 2 } })).toEqual({
      Foo: { a: 1, b: 2 },
    });
  });

  it('when useShortForm is false returns the spec as-is', () => {
    const spec = { name: 'Foo', arguments: null };
    expect(serializeEvaluatorSpec(spec, false)).toBe(spec);
  });
});

describe('specArgs and specKwargs', () => {
  it('specArgs returns positional args from tuple', () => {
    expect(specArgs({ name: 'X', arguments: [42] })).toEqual([42]);
  });

  it('specArgs returns empty for null', () => {
    expect(specArgs({ name: 'X', arguments: null })).toEqual([]);
  });

  it('specArgs returns empty for kwargs', () => {
    expect(specArgs({ name: 'X', arguments: { a: 1 } })).toEqual([]);
  });

  it('specKwargs returns kwargs from object', () => {
    expect(specKwargs({ name: 'X', arguments: { a: 1 } })).toEqual({ a: 1 });
  });

  it('specKwargs returns empty for null', () => {
    expect(specKwargs({ name: 'X', arguments: null })).toEqual({});
  });

  it('specKwargs returns empty for tuple', () => {
    expect(specKwargs({ name: 'X', arguments: [42] })).toEqual({});
  });
});

// ============ Individual Evaluators ============

describe('Equals', () => {
  it('returns true on exact match', () => {
    const ev = new Equals(42);
    expect(ev.evaluate(makeCtx({ output: 42 }))).toBe(true);
  });

  it('returns false on mismatch', () => {
    const ev = new Equals(42);
    expect(ev.evaluate(makeCtx({ output: 43 }))).toBe(false);
  });

  it('deep-compares objects', () => {
    const ev = new Equals({ a: 1, b: [2, 3] });
    expect(ev.evaluate(makeCtx({ output: { a: 1, b: [2, 3] } }))).toBe(true);
    expect(ev.evaluate(makeCtx({ output: { a: 1, b: [2, 4] } }))).toBe(false);
  });

  it('deep-compares arrays', () => {
    const ev = new Equals([1, 2, 3]);
    expect(ev.evaluate(makeCtx({ output: [1, 2, 3] }))).toBe(true);
    expect(ev.evaluate(makeCtx({ output: [1, 2] }))).toBe(false);
  });

  it('null/undefined comparison', () => {
    const ev = new Equals(null);
    expect(ev.evaluate(makeCtx({ output: null }))).toBe(true);
    expect(ev.evaluate(makeCtx({ output: undefined }))).toBe(false);
  });

  it('type-mismatched comparison returns false', () => {
    const ev = new Equals('42');
    expect(ev.evaluate(makeCtx({ output: 42 }))).toBe(false);
  });

  it('mixed array/non-array comparison', () => {
    const ev = new Equals([1]);
    expect(ev.evaluate(makeCtx({ output: { '0': 1 } }))).toBe(false);
  });

  it('different-length objects return false', () => {
    const ev = new Equals({ a: 1 });
    expect(ev.evaluate(makeCtx({ output: { a: 1, b: 2 } }))).toBe(false);
  });
});

describe('EqualsExpected', () => {
  it('returns true when output equals expected', () => {
    const ev = new EqualsExpected();
    expect(ev.evaluate(makeCtx({ output: 'hello', expectedOutput: 'hello' }))).toBe(true);
  });

  it('returns false when output does not equal expected', () => {
    const ev = new EqualsExpected();
    expect(ev.evaluate(makeCtx({ output: 'hello', expectedOutput: 'world' }))).toBe(false);
  });

  it('returns empty dict when expectedOutput is null', () => {
    const ev = new EqualsExpected();
    expect(ev.evaluate(makeCtx({ output: 'hello', expectedOutput: null }))).toEqual({});
  });

  it('returns empty dict when expectedOutput is undefined', () => {
    const ev = new EqualsExpected();
    expect(ev.evaluate(makeCtx({ output: 'hello', expectedOutput: undefined }))).toEqual({});
  });
});

describe('Contains', () => {
  it('checks string containment (both strings)', () => {
    const ev = new Contains('ell');
    expect(ev.evaluate(makeCtx({ output: 'hello world' }))).toEqual({ value: true });
  });

  it('returns reason on string mismatch', () => {
    const ev = new Contains('xyz');
    const result = ev.evaluate(makeCtx({ output: 'hello' }));
    expect(result).toHaveProperty('value', false);
    expect(result).toHaveProperty('reason');
  });

  it('checks case insensitive string containment', () => {
    const ev = new Contains('HELLO', { caseSensitive: false });
    expect(ev.evaluate(makeCtx({ output: 'hello world' }))).toEqual({ value: true });
  });

  it('asStrings forces string comparison', () => {
    const ev = new Contains(42, { asStrings: true });
    expect(ev.evaluate(makeCtx({ output: '42 is the answer' }))).toEqual({ value: true });
  });

  it('checks array containment', () => {
    const ev = new Contains(2);
    expect(ev.evaluate(makeCtx({ output: [1, 2, 3] }))).toEqual({ value: true });
  });

  it('returns false for array without value', () => {
    const ev = new Contains(5);
    const result = ev.evaluate(makeCtx({ output: [1, 2, 3] }));
    expect(result).toHaveProperty('value', false);
  });

  it('checks object key containment (string key)', () => {
    const ev = new Contains('foo');
    expect(ev.evaluate(makeCtx({ output: { foo: 1, bar: 2 } }))).toEqual({ value: true });
  });

  it('returns false when key not in object', () => {
    const ev = new Contains('baz');
    const result = ev.evaluate(makeCtx({ output: { foo: 1 } }));
    expect(result).toHaveProperty('value', false);
  });

  it('checks object dict containment (subset)', () => {
    const ev = new Contains({ foo: 1 });
    expect(ev.evaluate(makeCtx({ output: { foo: 1, bar: 2 } }))).toEqual({ value: true });
  });

  it('returns false on missing key in dict containment', () => {
    const ev = new Contains({ baz: 1 });
    const result = ev.evaluate(makeCtx({ output: { foo: 1 } }));
    expect(result).toHaveProperty('value', false);
  });

  it('returns false on value mismatch in dict containment', () => {
    const ev = new Contains({ foo: 2 });
    const result = ev.evaluate(makeCtx({ output: { foo: 1 } }));
    expect(result).toHaveProperty('value', false);
  });

  it('returns false for non-container types', () => {
    const ev = new Contains('x');
    const result = ev.evaluate(makeCtx({ output: 42 }));
    expect(result).toHaveProperty('value', false);
    expect((result as { reason: string }).reason).toContain('not a container type');
  });

  it('truncates long strings in reason messages', () => {
    const longString = 'x'.repeat(200);
    const ev = new Contains(longString);
    const result = ev.evaluate(makeCtx({ output: 'short' }));
    expect(result).toHaveProperty('value', false);
    expect((result as { reason: string }).reason).toContain('...');
  });
});

describe('IsInstance', () => {
  it('checks constructor name via prototype chain', () => {
    const ev = new IsInstance('Date');
    expect(ev.evaluate(makeCtx({ output: new Date() }))).toEqual({ value: true });
  });

  it('checks Array via Array.isArray', () => {
    const ev = new IsInstance('Array');
    expect(ev.evaluate(makeCtx({ output: [1, 2] }))).toEqual({ value: true });
  });

  it('returns false for wrong type', () => {
    const ev = new IsInstance('Array');
    const result = ev.evaluate(makeCtx({ output: 'not an array' }));
    expect(result).toHaveProperty('value', false);
    expect((result as { reason: string }).reason).toContain('String');
  });

  it('returns false for null', () => {
    const ev = new IsInstance('Object');
    const result = ev.evaluate(makeCtx({ output: null }));
    expect(result).toHaveProperty('value', false);
  });

  it('returns false for undefined', () => {
    const ev = new IsInstance('Object');
    const result = ev.evaluate(makeCtx({ output: undefined }));
    expect(result).toHaveProperty('value', false);
  });

  it('checks typeof for primitives', () => {
    const ev = new IsInstance('string');
    expect(ev.evaluate(makeCtx({ output: 'hello' }))).toEqual({ value: true });
  });
});

describe('MaxDuration', () => {
  it('returns true when under the limit', () => {
    const ev = new MaxDuration(5);
    expect(ev.evaluate(makeCtx({ duration: 2.0 }))).toBe(true);
  });

  it('returns false when over the limit', () => {
    const ev = new MaxDuration(1);
    expect(ev.evaluate(makeCtx({ duration: 2.0 }))).toBe(false);
  });

  it('returns true when exactly at the limit', () => {
    const ev = new MaxDuration(1);
    expect(ev.evaluate(makeCtx({ duration: 1.0 }))).toBe(true);
  });
});

describe('HasMatchingSpan', () => {
  it('returns true when matching span exists', () => {
    const tree = new SpanTree();
    const node = new SpanNode({
      name: 'my-span',
      traceId: 'abc',
      spanId: '001',
      parentSpanId: null,
      startTimestamp: new Date(1000),
      endTimestamp: new Date(2000),
      attributes: { 'http.method': 'GET' },
    });
    tree.addSpans([node]);

    const ev = new HasMatchingSpan({ nameEquals: 'my-span' });
    expect(ev.evaluate(makeCtx({ spanTreeOrError: tree }))).toBe(true);
  });

  it('returns false when no matching span exists', () => {
    const ev = new HasMatchingSpan({ nameEquals: 'nonexistent' });
    expect(ev.evaluate(makeCtx({ spanTreeOrError: new SpanTree() }))).toBe(false);
  });
});

// ============ updateCombinedOutput ============

describe('updateCombinedOutput', () => {
  it('adds value with default name', () => {
    const output: Record<string, EvaluationScalar | EvaluationReason> = {};
    updateCombinedOutput(output, true, null, {}, 'default');
    expect(output.default).toBe(true);
  });

  it('uses evaluationName from config when provided', () => {
    const output: Record<string, EvaluationScalar | EvaluationReason> = {};
    updateCombinedOutput(output, 42, null, { evaluationName: 'custom' }, 'default');
    expect(output.custom).toBe(42);
  });

  it('includes reason when config.includeReason is true', () => {
    const output: Record<string, EvaluationScalar | EvaluationReason> = {};
    updateCombinedOutput(output, true, 'because', { includeReason: true }, 'test');
    expect(output.test).toEqual({ value: true, reason: 'because' });
  });

  it('does not include reason when null even with includeReason true', () => {
    const output: Record<string, EvaluationScalar | EvaluationReason> = {};
    updateCombinedOutput(output, true, null, { includeReason: true }, 'test');
    expect(output.test).toBe(true);
  });
});

// ============ runEvaluator ============

describe('runEvaluator', () => {
  it('normalizes boolean output to single EvaluationResult', async () => {
    class AlwaysTrue extends Evaluator {
      evaluate(): boolean {
        return true;
      }
    }
    const ev = new AlwaysTrue();
    const result = await runEvaluator(ev, makeCtx());
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result).toHaveLength(1);
      expect(result[0]!.value).toBe(true);
      expect(result[0]!.name).toBe('AlwaysTrue');
    }
  });

  it('normalizes number output', async () => {
    class ScoreEval extends Evaluator {
      evaluate(): number {
        return 0.95;
      }
    }
    const ev = new ScoreEval();
    const result = await runEvaluator(ev, makeCtx());
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result[0]!.value).toBe(0.95);
    }
  });

  it('normalizes EvaluationReason output', async () => {
    class ReasonEval extends Evaluator {
      evaluate(): { value: boolean; reason: string } {
        return { value: false, reason: 'it failed' };
      }
    }
    const ev = new ReasonEval();
    const result = await runEvaluator(ev, makeCtx());
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result[0]!.value).toBe(false);
      expect(result[0]!.reason).toBe('it failed');
    }
  });

  it('normalizes dict output to multiple EvaluationResults', async () => {
    class MultiEval extends Evaluator {
      evaluate(): Record<string, boolean> {
        return { check_a: true, check_b: false };
      }
    }
    const ev = new MultiEval();
    const result = await runEvaluator(ev, makeCtx());
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result).toHaveLength(2);
      const names = result.map((r) => r.name).sort();
      expect(names).toEqual(['check_a', 'check_b']);
    }
  });

  it('catches evaluator errors and returns failure', async () => {
    class BadEval extends Evaluator {
      evaluate(): EvaluatorOutput {
        throw new Error('boom');
      }
    }
    const ev = new BadEval();
    const result = await runEvaluator(ev, makeCtx());
    expect(Array.isArray(result)).toBe(false);
    if (!Array.isArray(result)) {
      expect(result.errorMessage).toContain('boom');
      expect(result.name).toBe('BadEval');
    }
  });

  it('handles async evaluators', async () => {
    class AsyncEval extends Evaluator {
      async evaluate(): Promise<boolean> {
        return true;
      }
    }
    const ev = new AsyncEval();
    const result = await runEvaluator(ev, makeCtx());
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result[0]!.value).toBe(true);
    }
  });

  it('includes source spec in result', async () => {
    const ev = new Equals(42);
    const result = await runEvaluator(ev, makeCtx({ output: 42 }));
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result[0]!.source.name).toBe('Equals');
    }
  });
});

// ============ EvaluatorContext ============

describe('createEvaluatorContext', () => {
  it('creates context with all fields', () => {
    const ctx = makeCtx({
      inputs: 'hello',
      output: 'HELLO',
      expectedOutput: 'HELLO',
      metadata: { key: 'val' },
      duration: 2.5,
      attributes: { a: 1 },
      metrics: { b: 2 },
    });

    expect(ctx.inputs).toBe('hello');
    expect(ctx.output).toBe('HELLO');
    expect(ctx.expectedOutput).toBe('HELLO');
    expect(ctx.metadata).toEqual({ key: 'val' });
    expect(ctx.duration).toBe(2.5);
    expect(ctx.attributes).toEqual({ a: 1 });
    expect(ctx.metrics).toEqual({ b: 2 });
    expect(ctx.spanTree).toBeDefined();
  });

  it('spanTree throws on SpanTreeRecordingError', async () => {
    const { SpanTreeRecordingError } = await import('../src/otel/errors.js');
    const ctx = createEvaluatorContext({
      name: 'test',
      inputs: 'x',
      metadata: null,
      expectedOutput: null,
      output: 'y',
      duration: 1.0,
      attributes: {},
      metrics: {},
      spanTreeOrError: new SpanTreeRecordingError('no otel'),
    });

    expect(() => ctx.spanTree).toThrow('no otel');
  });
});

// -- deepEqual via buildSerializationArguments --
describe('BaseEvaluator deepEqual (via asSpec)', () => {
  it('handles arrays of different length in field defaults', () => {
    class ArrayFieldEval extends Evaluator {
      items: number[];
      constructor(items: number[] = [1, 2, 3]) {
        super();
        this.items = items;
      }
      protected getFields() {
        return { items: this.items };
      }
      protected getDefaults() {
        return { items: [1, 2, 3] };
      }
      evaluate() {
        return true;
      }
    }
    // Default value -> arguments should be null
    const ev1 = new ArrayFieldEval();
    expect(ev1.asSpec().arguments).toBeNull();

    // Different length array -> should appear in arguments
    const ev2 = new ArrayFieldEval([1, 2]);
    expect(ev2.asSpec().arguments).toEqual([[1, 2]]);
  });

  it('handles mixed array/object comparison', () => {
    class MixedFieldEval extends Evaluator {
      data: unknown;
      constructor(data: unknown = [1, 2]) {
        super();
        this.data = data;
      }
      protected getFields() {
        return { data: this.data };
      }
      protected getDefaults() {
        return { data: [1, 2] };
      }
      evaluate() {
        return true;
      }
    }
    // Object instead of array -> not equal to default
    const ev = new MixedFieldEval({ a: 1 });
    expect(ev.asSpec().arguments).toEqual([{ a: 1 }]);
  });

  it('handles objects with different key counts', () => {
    class ObjFieldEval extends Evaluator {
      opts: Record<string, unknown>;
      constructor(opts: Record<string, unknown> = { a: 1 }) {
        super();
        this.opts = opts;
      }
      protected getFields() {
        return { opts: this.opts };
      }
      protected getDefaults() {
        return { opts: { a: 1 } };
      }
      evaluate() {
        return true;
      }
    }
    // Extra key -> not equal
    const ev = new ObjFieldEval({ a: 1, b: 2 });
    expect(ev.asSpec().arguments).toEqual([{ a: 1, b: 2 }]);
  });

  it('handles objects with same keys but different values', () => {
    class DeepFieldEval extends Evaluator {
      opts: Record<string, unknown>;
      constructor(opts: Record<string, unknown> = { a: 1, b: 2 }) {
        super();
        this.opts = opts;
      }
      protected getFields() {
        return { opts: this.opts };
      }
      protected getDefaults() {
        return { opts: { a: 1, b: 2 } };
      }
      evaluate() {
        return true;
      }
    }
    // Same keys, different values
    const ev = new DeepFieldEval({ a: 1, b: 3 });
    expect(ev.asSpec().arguments).toEqual([{ a: 1, b: 3 }]);

    // Same keys, same values => default
    const ev2 = new DeepFieldEval({ a: 1, b: 2 });
    expect(ev2.asSpec().arguments).toBeNull();
  });

  it('handles null vs object in defaults', () => {
    class NullFieldEval extends Evaluator {
      val: unknown;
      constructor(val: unknown = null) {
        super();
        this.val = val;
      }
      protected getFields() {
        return { val: this.val };
      }
      protected getDefaults() {
        return { val: null };
      }
      evaluate() {
        return true;
      }
    }
    const ev1 = new NullFieldEval(null);
    expect(ev1.asSpec().arguments).toBeNull();

    const ev2 = new NullFieldEval({ x: 1 });
    expect(ev2.asSpec().arguments).toEqual([{ x: 1 }]);
  });

  it('handles different types in field vs default', () => {
    class TypeMixEval extends Evaluator {
      val: unknown;
      constructor(val: unknown = 42) {
        super();
        this.val = val;
      }
      protected getFields() {
        return { val: this.val };
      }
      protected getDefaults() {
        return { val: 42 };
      }
      evaluate() {
        return true;
      }
    }
    // String vs number default - different types
    const ev = new TypeMixEval('hello');
    expect(ev.asSpec().arguments).toEqual(['hello']);
  });
});

// -- IsInstance serialization --
describe('IsInstance serialization', () => {
  it('serializes with default evaluationName', () => {
    const ev = new IsInstance('String');
    const spec = ev.asSpec();
    expect(spec.name).toBe('IsInstance');
    expect(spec.arguments).toEqual(['String']);
  });

  it('serializes with custom evaluationName', () => {
    const ev = new IsInstance('Date', 'is_date');
    const spec = ev.asSpec();
    expect(spec.arguments).toEqual({ typeName: 'Date', evaluationName: 'is_date' });
  });
});

// -- HasMatchingSpan serialization --
describe('HasMatchingSpan serialization', () => {
  it('serializes with custom evaluationName', () => {
    const ev = new HasMatchingSpan({ name_equals: 'test' }, 'custom_name');
    const spec = ev.asSpec();
    expect(spec.name).toBe('HasMatchingSpan');
    expect(spec.arguments).toEqual({
      query: { name_equals: 'test' },
      evaluationName: 'custom_name',
    });
  });

  it('serializes with default evaluationName (null omitted)', () => {
    const ev = new HasMatchingSpan({ name_equals: 'test' });
    const spec = ev.asSpec();
    expect(spec.arguments).toEqual([{ name_equals: 'test' }]);
  });

  it('getDefaultEvaluationName uses evaluationName if set', () => {
    const ev = new HasMatchingSpan({}, 'my_check');
    expect(ev.getDefaultEvaluationName()).toBe('my_check');
  });
});

// -- runEvaluator with EvaluationReason and errors --
describe('runEvaluator advanced', () => {
  it('handles evaluator returning EvaluationReason', async () => {
    class ReasonEval extends Evaluator {
      evaluate(): EvaluatorOutput {
        return { value: true, reason: 'because' };
      }
    }
    const ctx = makeCtx();
    const result = await runEvaluator(new ReasonEval(), ctx);
    expect(Array.isArray(result)).toBe(true);
    const results = result as import('../src/types.js').EvaluationResult[];
    expect(results[0]!.value).toBe(true);
    expect(results[0]!.reason).toBe('because');
  });

  it('handles evaluator returning EvaluationReason without reason field', async () => {
    class NoReasonEval extends Evaluator {
      evaluate(): EvaluatorOutput {
        return { value: 0.5 };
      }
    }
    const ctx = makeCtx();
    const result = await runEvaluator(new NoReasonEval(), ctx);
    expect(Array.isArray(result)).toBe(true);
    const results = result as import('../src/types.js').EvaluationResult[];
    expect(results[0]!.value).toBe(0.5);
    expect(results[0]!.reason).toBeNull();
  });

  it('catches evaluator exceptions and returns failure', async () => {
    class ThrowingEval extends Evaluator {
      evaluate(): never {
        throw new Error('eval failed');
      }
    }
    const ctx = makeCtx();
    const result = await runEvaluator(new ThrowingEval(), ctx);
    expect(Array.isArray(result)).toBe(false);
    const failure = result as import('../src/types.js').EvaluatorFailure;
    expect(failure.errorMessage).toContain('eval failed');
    expect(failure.errorStacktrace).toBeDefined();
  });

  it('catches non-Error exceptions', async () => {
    class StringThrowEval extends Evaluator {
      evaluate(): never {
        throw 'raw string error';
      }
    }
    const ctx = makeCtx();
    const result = await runEvaluator(new StringThrowEval(), ctx);
    expect(Array.isArray(result)).toBe(false);
    const failure = result as import('../src/types.js').EvaluatorFailure;
    expect(failure.errorMessage).toContain('raw string error');
  });
});
