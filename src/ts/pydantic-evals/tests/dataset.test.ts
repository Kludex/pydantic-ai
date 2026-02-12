import { describe, expect, it } from 'vitest';
import { withTaskRun } from '../src/context.js';
import { Dataset, incrementEvalMetric, setEvalAttribute } from '../src/dataset.js';
import { Equals, EqualsExpected } from '../src/evaluators/common.js';
import { Evaluator } from '../src/evaluators/evaluator.js';

describe('Dataset', () => {
  it('creates a dataset with cases', () => {
    const ds = new Dataset({
      cases: [
        { name: 'a', inputs: 'hello' },
        { name: 'b', inputs: 'world' },
      ],
    });
    expect(ds.cases).toHaveLength(2);
    expect(ds.name).toBeNull();
  });

  it('rejects duplicate case names', () => {
    expect(
      () =>
        new Dataset({
          cases: [
            { name: 'dup', inputs: 1 },
            { name: 'dup', inputs: 2 },
          ],
        }),
    ).toThrow('Duplicate case name');
  });

  it('allows unnamed cases', () => {
    const ds = new Dataset({
      cases: [{ inputs: 1 }, { inputs: 2 }],
    });
    expect(ds.cases).toHaveLength(2);
  });

  it('addCase works', () => {
    const ds = new Dataset({ cases: [] });
    ds.addCase({ name: 'a', inputs: 1 });
    expect(ds.cases).toHaveLength(1);
  });

  it('addCase rejects duplicate names', () => {
    const ds = new Dataset({ cases: [{ name: 'a', inputs: 1 }] });
    expect(() => ds.addCase({ name: 'a', inputs: 2 })).toThrow('Duplicate case name');
  });

  it('addEvaluator adds to dataset level', () => {
    const ds = new Dataset({ cases: [{ name: 'a', inputs: 1 }] });
    ds.addEvaluator(new EqualsExpected());
    expect(ds.evaluators).toHaveLength(1);
  });

  it('addEvaluator adds to specific case', () => {
    const ds = new Dataset({ cases: [{ name: 'a', inputs: 1 }] });
    ds.addEvaluator(new EqualsExpected(), 'a');
    expect(ds.cases[0]!.evaluators).toHaveLength(1);
  });

  it('addEvaluator throws for non-existent case', () => {
    const ds = new Dataset({ cases: [{ name: 'a', inputs: 1 }] });
    expect(() => ds.addEvaluator(new EqualsExpected(), 'nonexistent')).toThrow('not found');
  });
});

describe('Dataset.evaluate', () => {
  it('evaluates simple task', async () => {
    const ds = new Dataset<string, string>({
      cases: [
        { name: 'upper', inputs: 'hello', expectedOutput: 'HELLO' },
        { name: 'lower', inputs: 'WORLD', expectedOutput: 'world' },
      ],
      evaluators: [new EqualsExpected()],
    });

    const report = await ds.evaluate((input) => input.toUpperCase());
    expect(report.name).toBe('task');
    expect(report.cases).toHaveLength(2);

    // First case should pass (hello -> HELLO matches expected)
    const upperCase = report.cases.find((c) => c.name === 'upper')!;
    expect(upperCase.assertions.EqualsExpected?.value).toBe(true);

    // Second case should fail (WORLD -> WORLD != world)
    const lowerCase = report.cases.find((c) => c.name === 'lower')!;
    expect(lowerCase.assertions.EqualsExpected?.value).toBe(false);
  });

  it('uses task function name', async () => {
    const ds = new Dataset({
      cases: [{ inputs: 'x' }],
    });
    function myProcessor(input: unknown) {
      return input;
    }
    const report = await ds.evaluate(myProcessor);
    expect(report.name).toBe('myProcessor');
  });

  it('uses opts.name over function name', async () => {
    const ds = new Dataset({ cases: [{ inputs: 'x' }] });
    const report = await ds.evaluate((x) => x, { name: 'custom' });
    expect(report.name).toBe('custom');
  });

  it('defaults name to task when arrow function has no name', async () => {
    const ds = new Dataset({ cases: [{ inputs: 'x' }] });
    const report = await ds.evaluate((x) => x);
    // Arrow functions have empty name
    expect(report.name).toBe('task');
  });

  it('handles async task functions', async () => {
    const ds = new Dataset<string, string>({
      cases: [{ name: 'test', inputs: 'hello' }],
    });
    const report = await ds.evaluate(async (input) => {
      await new Promise((r) => setTimeout(r, 1));
      return input.toUpperCase();
    });
    expect(report.cases).toHaveLength(1);
    expect(report.cases[0]!.output).toBe('HELLO');
  });

  it('captures task failures', async () => {
    const ds = new Dataset({
      cases: [{ name: 'fail', inputs: 'x' }],
    });
    const report = await ds.evaluate(() => {
      throw new Error('task failed');
    });
    expect(report.cases).toHaveLength(0);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]!.errorMessage).toContain('task failed');
  });

  it('supports repeat option', async () => {
    const ds = new Dataset({
      cases: [{ name: 'test', inputs: 'x' }],
    });
    const report = await ds.evaluate((x) => x, { repeat: 3 });
    expect(report.cases).toHaveLength(3);
    // Should have sourceCaseName set
    expect(report.cases[0]!.sourceCaseName).toBe('test');
  });

  it('rejects repeat < 1', async () => {
    const ds = new Dataset({ cases: [{ inputs: 'x' }] });
    await expect(ds.evaluate((x) => x, { repeat: 0 })).rejects.toThrow('repeat must be >= 1');
  });

  it('supports maxConcurrency', async () => {
    const running: number[] = [];
    let maxRunning = 0;

    const ds = new Dataset({
      cases: Array.from({ length: 5 }, (_, i) => ({ name: `c${i}`, inputs: i })),
    });

    const report = await ds.evaluate(
      async (input) => {
        running.push(1);
        maxRunning = Math.max(maxRunning, running.length);
        await new Promise((r) => setTimeout(r, 10));
        running.pop();
        return input;
      },
      { maxConcurrency: 2 },
    );

    expect(report.cases).toHaveLength(5);
    expect(maxRunning).toBeLessThanOrEqual(2);
  });

  it('includes case-level evaluators', async () => {
    const ds = new Dataset<string, string>({
      cases: [
        {
          name: 'test',
          inputs: 'hello',
          evaluators: [new Equals('HELLO')],
        },
      ],
    });
    const report = await ds.evaluate((input) => input.toUpperCase());
    expect(report.cases[0]!.assertions.Equals?.value).toBe(true);
  });

  it('assigns auto names to unnamed cases', async () => {
    const ds = new Dataset({
      cases: [{ inputs: 'a' }, { inputs: 'b' }],
    });
    const report = await ds.evaluate((x) => x);
    const names = report.cases.map((c) => c.name);
    expect(names).toEqual(['Case 1', 'Case 2']);
  });

  it('deduplicates evaluator output names', async () => {
    class DupName extends Evaluator {
      evaluate(): boolean {
        return true;
      }

      getDefaultEvaluationName(): string {
        return 'check';
      }
    }
    const ds = new Dataset({
      cases: [{ name: 'test', inputs: 'x' }],
      evaluators: [new DupName(), new DupName()],
    });
    const report = await ds.evaluate((x) => x);
    const assertionNames = Object.keys(report.cases[0]!.assertions);
    expect(assertionNames).toContain('check');
    expect(assertionNames).toContain('check_2');
  });

  it('deduplicates evaluator output names with suffix > 2', async () => {
    class DupName extends Evaluator {
      evaluate(): boolean {
        return true;
      }
      getDefaultEvaluationName(): string {
        return 'dup';
      }
    }
    const ds = new Dataset({
      cases: [{ name: 'test', inputs: 'x' }],
      evaluators: [new DupName(), new DupName(), new DupName()],
    });
    const report = await ds.evaluate((x) => x);
    const assertionNames = Object.keys(report.cases[0]!.assertions);
    expect(assertionNames).toContain('dup');
    expect(assertionNames).toContain('dup_2');
    expect(assertionNames).toContain('dup_3');
  });

  it('groups score and label evaluator outputs', async () => {
    class ScoreEval extends Evaluator {
      evaluate(): number {
        return 0.95;
      }
    }
    class LabelEval extends Evaluator {
      evaluate(): string {
        return 'good';
      }
    }
    const ds = new Dataset({
      cases: [{ name: 'test', inputs: 'x' }],
      evaluators: [new ScoreEval(), new LabelEval()],
    });
    const report = await ds.evaluate((x) => x);
    expect(report.cases[0]!.scores.ScoreEval?.value).toBe(0.95);
    expect(report.cases[0]!.labels.LabelEval?.value).toBe('good');
  });

  it('runs report evaluators', async () => {
    const { ConfusionMatrixEvaluator } = await import('../src/evaluators/report-common.js');

    const ds = new Dataset<string, string>({
      cases: [
        { name: 'a', inputs: 'cat', expectedOutput: 'cat' },
        { name: 'b', inputs: 'dog', expectedOutput: 'dog' },
      ],
      reportEvaluators: [new ConfusionMatrixEvaluator()],
    });

    const report = await ds.evaluate((input) => input);
    expect(report.analyses).toHaveLength(1);
    expect(report.analyses[0]!.type).toBe('confusion_matrix');
  });

  it('runs report evaluator that returns array', async () => {
    const { ReportEvaluator } = await import('../src/evaluators/report-evaluator.js');
    const { type: _ } = await import('../src/reporting/analyses.js');

    class MultiAnalysis extends ReportEvaluator {
      evaluate() {
        return [
          { type: 'scalar' as const, title: 'A', value: 1 },
          { type: 'scalar' as const, title: 'B', value: 2 },
        ];
      }
    }

    const ds = new Dataset({
      cases: [{ name: 'a', inputs: 'x' }],
      reportEvaluators: [new MultiAnalysis()],
    });
    const report = await ds.evaluate((x) => x);
    expect(report.analyses).toHaveLength(2);
  });

  it('captures report evaluator failures', async () => {
    const { ReportEvaluator } = await import('../src/evaluators/report-evaluator.js');

    class BadReportEval extends ReportEvaluator {
      evaluate(): never {
        throw new Error('report eval failed');
      }
    }

    const ds = new Dataset({
      cases: [{ name: 'a', inputs: 'x' }],
      reportEvaluators: [new BadReportEval()],
    });
    const report = await ds.evaluate((x) => x);
    expect(report.reportEvaluatorFailures).toHaveLength(1);
    expect(report.reportEvaluatorFailures[0]!.errorMessage).toContain('report eval failed');
  });

  it('passes experiment metadata', async () => {
    const ds = new Dataset({ cases: [{ inputs: 'x' }] });
    const report = await ds.evaluate((x) => x, { metadata: { version: '1.0' } });
    expect(report.experimentMetadata).toEqual({ version: '1.0' });
  });

  it('captures evaluator failures in report case', async () => {
    class FailingEval extends Evaluator {
      evaluate(): never {
        throw new Error('evaluator boom');
      }
    }
    const ds = new Dataset({
      cases: [{ name: 'test', inputs: 'x' }],
      evaluators: [new FailingEval()],
    });
    const report = await ds.evaluate((x) => x);
    expect(report.cases).toHaveLength(1);
    const c = report.cases[0]!;
    expect(c.evaluatorFailures).toHaveLength(1);
    expect(c.evaluatorFailures[0]!.errorMessage).toContain('evaluator boom');
  });
});

// ============ Context (AsyncLocalStorage) ============

describe('withTaskRun / setEvalAttribute / incrementEvalMetric', () => {
  it('captures attributes set during task run', async () => {
    const { attributes } = await withTaskRun(async () => {
      setEvalAttribute('model', 'gpt-4');
      return 42;
    });
    expect(attributes).toEqual({ model: 'gpt-4' });
  });

  it('captures metrics set during task run', async () => {
    const { result, metrics } = await withTaskRun(async () => {
      incrementEvalMetric('tokens', 100);
      incrementEvalMetric('tokens', 50);
      return 'done';
    });
    expect(result).toBe('done');
    expect(metrics).toEqual({ tokens: 150 });
  });

  it('setEvalAttribute is no-op outside of task run', () => {
    // Should not throw
    setEvalAttribute('key', 'value');
  });

  it('incrementEvalMetric is no-op outside of task run', () => {
    // Should not throw
    incrementEvalMetric('key', 10);
  });

  it('skips recording zero increment from zero', async () => {
    const { metrics } = await withTaskRun(async () => {
      incrementEvalMetric('zero', 0);
      return null;
    });
    expect(metrics).toEqual({});
  });

  it('isolates context between concurrent runs', async () => {
    const [r1, r2] = await Promise.all([
      withTaskRun(async () => {
        setEvalAttribute('run', 1);
        await new Promise((r) => setTimeout(r, 10));
        return 'a';
      }),
      withTaskRun(async () => {
        setEvalAttribute('run', 2);
        return 'b';
      }),
    ]);

    expect(r1.attributes).toEqual({ run: 1 });
    expect(r2.attributes).toEqual({ run: 2 });
  });
});
