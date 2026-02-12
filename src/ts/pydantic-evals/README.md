# Pydantic Evals (TypeScript)

A TypeScript port of the Python [`pydantic-evals`](../../pydantic_evals/) evaluation framework for systematically testing and evaluating stochastic functions — from simple LLM calls to complex multi-agent applications.

This package mirrors the design and API of the Python version, adapted to idiomatic TypeScript with Zod for schema validation.

Full documentation is available at [ai.pydantic.dev/evals-ts](https://ai.pydantic.dev/evals-ts/).

## Prerequisites

- Node.js >= 18
- npm (or your preferred package manager)

## Installation

```bash
npm install
```

## Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Build | `npm run build` | Compile TypeScript to JavaScript |
| Typecheck | `npm run typecheck` | Run `tsc --noEmit` |
| Test | `npm run test` | Run tests with Vitest |
| Test (coverage) | `npm run test:coverage` | Run tests with coverage reporting |
| Lint | `npm run lint` | Check code with Biome |
| Lint (fix) | `npm run lint:fix` | Auto-fix lint issues |
| Format | `npm run format` | Format code with Biome |

## Example

```typescript
import { Case, Dataset } from 'pydantic-evals';
import { Evaluator, IsInstance } from 'pydantic-evals/evaluators';
import type { EvaluatorContext } from 'pydantic-evals/evaluators';

// Define a test case with inputs and expected output
const case1: Case<string, string> = {
  name: 'capital_question',
  inputs: 'What is the capital of France?',
  expectedOutput: 'Paris',
};

// Define a custom evaluator
class MatchAnswer extends Evaluator {
  async evaluate(ctx: EvaluatorContext<string, string>): Promise<number> {
    if (ctx.output === ctx.expectedOutput) {
      return 1.0;
    }
    if (typeof ctx.output === 'string' && ctx.expectedOutput
        && ctx.expectedOutput.toLowerCase().includes(String(ctx.output).toLowerCase())) {
      return 0.8;
    }
    return 0.0;
  }
}

// Create a dataset with the test case and evaluators
const dataset = new Dataset({
  cases: [case1],
  evaluators: [new IsInstance({ typeName: 'string' }), new MatchAnswer()],
});

// Define the function to evaluate
async function answerQuestion(question: string): Promise<string> {
  return 'Paris';
}

// Run the evaluation and print results
const report = await dataset.evaluate(answerQuestion);
report.print({ includeInput: true, includeOutput: true });
```

## Features

- **Built-in evaluators**: `Equals`, `EqualsExpected`, `Contains`, `IsInstance`, `MaxDuration`, `HasMatchingSpan`, `LLMJudge`
- **Report evaluators**: `ConfusionMatrixEvaluator`, `PrecisionRecallEvaluator` for experiment-wide analysis
- **YAML/JSON dataset loading**: Load datasets from files with Zod schema validation
- **OTel span capture**: Capture and query OpenTelemetry spans during evaluation with `withSpanCapture`
- **Concurrency control**: Limit parallel case execution
- **Report rendering**: Formatted table output with scores, assertions, and durations
- **Custom evaluators**: Extend the `Evaluator` base class for domain-specific scoring
