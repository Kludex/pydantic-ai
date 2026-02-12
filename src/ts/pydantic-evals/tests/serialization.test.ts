import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Dataset } from '../src/dataset.js';
import { Equals, EqualsExpected } from '../src/evaluators/common.js';
import { Evaluator } from '../src/evaluators/evaluator.js';
import {
  loadDatasetFromFile,
  loadDatasetFromObject,
  loadDatasetFromText,
  saveDatasetToFile,
} from '../src/serialization/loader.js';
import {
  caseSchema,
  datasetSchema,
  defaultCaseSchema,
  defaultDatasetSchema,
  evaluatorSpecSchema,
} from '../src/serialization/schema.js';

describe('Zod schemas', () => {
  describe('evaluatorSpecSchema', () => {
    it('accepts a string', () => {
      const result = evaluatorSpecSchema.parse('EqualsExpected');
      expect(result).toBe('EqualsExpected');
    });

    it('accepts a single-key object', () => {
      const result = evaluatorSpecSchema.parse({ Equals: 42 });
      expect(result).toEqual({ Equals: 42 });
    });

    it('rejects multi-key object', () => {
      expect(() => evaluatorSpecSchema.parse({ A: 1, B: 2 })).toThrow();
    });

    it('rejects non-string, non-object', () => {
      expect(() => evaluatorSpecSchema.parse(42)).toThrow();
    });
  });

  describe('caseSchema', () => {
    it('validates a minimal case', () => {
      const schema = caseSchema(z.string(), z.unknown(), z.unknown());
      const result = schema.parse({ inputs: 'hello' });
      expect(result.inputs).toBe('hello');
    });

    it('validates a full case', () => {
      const schema = caseSchema(z.string(), z.string(), z.object({ key: z.string() }));
      const result = schema.parse({
        name: 'test',
        inputs: 'hello',
        expected_output: 'HELLO',
        metadata: { key: 'val' },
        evaluators: ['EqualsExpected'],
      });
      expect(result.name).toBe('test');
      expect(result.expected_output).toBe('HELLO');
    });

    it('rejects unknown keys in strict mode', () => {
      const schema = caseSchema(z.string(), z.unknown(), z.unknown());
      expect(() => schema.parse({ inputs: 'hello', unknown_field: true })).toThrow();
    });
  });

  describe('datasetSchema', () => {
    it('validates a dataset', () => {
      const schema = datasetSchema(z.string(), z.string(), z.unknown());
      const result = schema.parse({
        cases: [{ inputs: 'hello', expected_output: 'HELLO' }],
      });
      expect(result.cases).toHaveLength(1);
    });

    it('supports $schema field', () => {
      const schema = datasetSchema(z.unknown(), z.unknown(), z.unknown());
      const result = schema.parse({
        $schema: 'http://example.com/schema.json',
        cases: [],
      });
      expect(result.$schema).toBe('http://example.com/schema.json');
    });

    it('defaults evaluators and report_evaluators to empty', () => {
      const result = defaultDatasetSchema.parse({ cases: [] });
      expect(result.evaluators).toEqual([]);
      expect(result.report_evaluators).toEqual([]);
    });
  });

  describe('defaultCaseSchema', () => {
    it('accepts unknown types', () => {
      const result = defaultCaseSchema.parse({
        inputs: { nested: [1, 2] },
        metadata: 'some-meta',
      });
      expect(result.inputs).toEqual({ nested: [1, 2] });
    });
  });
});

describe('loadDatasetFromText', () => {
  it('loads a YAML dataset', () => {
    const yaml = `
cases:
  - name: test1
    inputs: hello
    expected_output: HELLO
  - name: test2
    inputs: world
`;
    const ds = loadDatasetFromText(yaml, { fmt: 'yaml' });
    expect(ds.cases).toHaveLength(2);
    expect(ds.cases[0]!.name).toBe('test1');
    expect(ds.cases[0]!.inputs).toBe('hello');
    expect(ds.cases[0]!.expectedOutput).toBe('HELLO');
  });

  it('loads a JSON dataset', () => {
    const json = JSON.stringify({
      cases: [{ name: 'test', inputs: 42, expected_output: 84 }],
    });
    const ds = loadDatasetFromText(json, { fmt: 'json' });
    expect(ds.cases).toHaveLength(1);
    expect(ds.cases[0]!.inputs).toBe(42);
  });

  it('loads dataset with evaluators', () => {
    const yaml = `
cases:
  - name: test
    inputs: hello
    expected_output: HELLO
evaluators:
  - EqualsExpected
`;
    const ds = loadDatasetFromText(yaml, { fmt: 'yaml' });
    expect(ds.evaluators).toHaveLength(1);
  });

  it('loads dataset with case-level evaluators', () => {
    const yaml = `
cases:
  - name: test
    inputs: hello
    evaluators:
      - Equals: HELLO
`;
    const ds = loadDatasetFromText(yaml, { fmt: 'yaml' });
    expect(ds.cases[0]!.evaluators).toHaveLength(1);
  });

  it('loads dataset with report evaluators', () => {
    const yaml = `
cases:
  - inputs: x
report_evaluators:
  - ConfusionMatrixEvaluator
`;
    const ds = loadDatasetFromText(yaml, { fmt: 'yaml' });
    expect(ds.reportEvaluators).toHaveLength(1);
  });

  it('uses defaultName from opts', () => {
    const yaml = 'cases:\n  - inputs: x';
    const ds = loadDatasetFromText(yaml, { fmt: 'yaml', defaultName: 'fallback' });
    expect(ds.name).toBe('fallback');
  });

  it('prefers name in data over defaultName', () => {
    const yaml = 'name: explicit\ncases:\n  - inputs: x';
    const ds = loadDatasetFromText(yaml, { fmt: 'yaml', defaultName: 'fallback' });
    expect(ds.name).toBe('explicit');
  });

  it('throws for unknown evaluator', () => {
    const yaml = `
cases:
  - inputs: x
evaluators:
  - UnknownEval
`;
    expect(() => loadDatasetFromText(yaml, { fmt: 'yaml' })).toThrow('not in the registry');
  });

  it('throws for unknown report evaluator', () => {
    const yaml = `
cases:
  - inputs: x
report_evaluators:
  - UnknownReportEval
`;
    expect(() => loadDatasetFromText(yaml, { fmt: 'yaml' })).toThrow('not in the registry');
  });
});

describe('loadDatasetFromObject', () => {
  it('loads from plain object', () => {
    const ds = loadDatasetFromObject({
      cases: [{ inputs: 'hello' }],
    });
    expect(ds.cases).toHaveLength(1);
  });

  it('supports custom schema', () => {
    const schema = datasetSchema(z.number(), z.number(), z.unknown());
    const ds = loadDatasetFromObject({ cases: [{ inputs: 42 }] }, { schema });
    expect(ds.cases[0]!.inputs).toBe(42);
  });
});

describe('loadDatasetFromFile / saveDatasetToFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'evals-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('round-trips YAML', () => {
    const ds = new Dataset({
      name: 'my-dataset',
      cases: [
        { name: 'a', inputs: 'hello', expectedOutput: 'HELLO' },
        { name: 'b', inputs: 'world', metadata: { key: 'val' } },
      ],
      evaluators: [new EqualsExpected()],
    });

    const path = join(tmpDir, 'test.yaml');
    saveDatasetToFile(ds, path);

    const loaded = loadDatasetFromFile(path);
    expect(loaded.name).toBe('my-dataset');
    expect(loaded.cases).toHaveLength(2);
    expect(loaded.cases[0]!.name).toBe('a');
    expect(loaded.evaluators).toHaveLength(1);
  });

  it('round-trips JSON', () => {
    const ds = new Dataset({
      cases: [{ name: 'test', inputs: { nested: true } }],
    });

    const path = join(tmpDir, 'test.json');
    saveDatasetToFile(ds, path);

    const loaded = loadDatasetFromFile(path);
    expect(loaded.cases).toHaveLength(1);
    expect(loaded.cases[0]!.inputs).toEqual({ nested: true });
  });

  it('infers format from extension', () => {
    const ds = new Dataset({ cases: [{ inputs: 'x' }] });

    const yamlPath = join(tmpDir, 'test.yml');
    saveDatasetToFile(ds, yamlPath);
    const yamlContent = readFileSync(yamlPath, 'utf-8');
    expect(yamlContent).toContain('cases:');

    const jsonPath = join(tmpDir, 'test.json');
    saveDatasetToFile(ds, jsonPath);
    const jsonContent = readFileSync(jsonPath, 'utf-8');
    expect(JSON.parse(jsonContent)).toHaveProperty('cases');
  });

  it('throws for unknown extension', () => {
    const ds = new Dataset({ cases: [{ inputs: 'x' }] });
    expect(() => saveDatasetToFile(ds, join(tmpDir, 'test.txt'))).toThrow('Could not infer format');
  });

  it('overrides format with fmt option', () => {
    const ds = new Dataset({ cases: [{ inputs: 'x' }] });
    const path = join(tmpDir, 'test.txt');
    saveDatasetToFile(ds, path, { fmt: 'json' });
    const content = readFileSync(path, 'utf-8');
    expect(JSON.parse(content)).toHaveProperty('cases');
  });

  it('derives name from filename', () => {
    const ds = new Dataset({ cases: [{ inputs: 'x' }] });
    const path = join(tmpDir, 'my-dataset.yaml');
    saveDatasetToFile(ds, path);
    const loaded = loadDatasetFromFile(path);
    expect(loaded.name).toBe('my-dataset');
  });

  it('serializes case-level evaluators', () => {
    const ds = new Dataset({
      cases: [{ name: 'a', inputs: 'x', evaluators: [new Equals(42)] }],
    });
    const path = join(tmpDir, 'test.yaml');
    saveDatasetToFile(ds, path);
    const loaded = loadDatasetFromFile(path);
    expect(loaded.cases[0]!.evaluators).toHaveLength(1);
  });

  it('serializes report evaluators', async () => {
    const { ConfusionMatrixEvaluator } = await import('../src/evaluators/report-common.js');
    const ds = new Dataset({
      cases: [{ inputs: 'x' }],
      reportEvaluators: [new ConfusionMatrixEvaluator()],
    });
    const path = join(tmpDir, 'test.yaml');
    saveDatasetToFile(ds, path);
    const loaded = loadDatasetFromFile(path);
    expect(loaded.reportEvaluators).toHaveLength(1);
  });
});

describe('evaluator registry', () => {
  it('rejects duplicate custom evaluator names', () => {
    const yaml = 'cases:\n  - inputs: x\nevaluators:\n  - EqualsExpected';
    // Passing two classes with the same name should throw
    expect(() =>
      loadDatasetFromText(yaml, {
        fmt: 'yaml',
        customEvaluatorTypes: [EqualsExpected as any, EqualsExpected as any],
      }),
    ).toThrow('Duplicate evaluator class name');
  });

  it('wraps instantiation errors', () => {
    class BadEval extends Evaluator {
      constructor() {
        super();
        throw new Error('cannot create');
      }
      evaluate() {
        return true;
      }
    }
    const yaml = 'cases:\n  - inputs: x\nevaluators:\n  - BadEval';
    expect(() =>
      loadDatasetFromText(yaml, {
        fmt: 'yaml',
        customEvaluatorTypes: [BadEval as any],
      }),
    ).toThrow("Failed to instantiate evaluator 'BadEval'");
  });

  it('wraps non-Error instantiation errors', () => {
    class BadEval2 extends Evaluator {
      constructor() {
        super();
        throw 'string error';
      }
      evaluate() {
        return true;
      }
    }
    const yaml = 'cases:\n  - inputs: x\nevaluators:\n  - BadEval2';
    expect(() =>
      loadDatasetFromText(yaml, {
        fmt: 'yaml',
        customEvaluatorTypes: [BadEval2 as any],
      }),
    ).toThrow("Failed to instantiate evaluator 'BadEval2'");
  });

  it('passes kwargs-style arguments to evaluator constructor', () => {
    const yaml = `cases:\n  - inputs: x\nevaluators:\n  - Contains:\n      expected: hello`;
    const ds = loadDatasetFromText(yaml, { fmt: 'yaml' });
    expect(ds.evaluators).toHaveLength(1);
  });
});
