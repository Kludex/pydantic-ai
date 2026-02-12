---
title: Pydantic Evals (TypeScript)
---

# Pydantic Evals (TypeScript)

**Pydantic Evals (TypeScript)** is a TypeScript port of the Python [Pydantic Evals](evals.md) framework for systematically testing and evaluating stochastic functions.

It mirrors the design and API of the Python version — `Dataset`, `Case`, `Evaluator`, and report rendering all work the same way — adapted to idiomatic TypeScript with [Zod](https://zod.dev) for schema validation.

!!! note "Early Stage"
    This is an early-stage port. The API closely follows the Python version but may evolve as the TypeScript ecosystem around it matures. For the full conceptual documentation, see [Pydantic Evals (Python)](evals.md).

## Installation

The package lives in the Pydantic AI monorepo at `src/ts/pydantic-evals/`. To get started:

```bash
cd src/ts/pydantic-evals
npm install
npm run build
```

## Quick Start

```typescript
import { Case, Dataset } from 'pydantic-evals';
import { Evaluator, IsInstance } from 'pydantic-evals/evaluators';
import type { EvaluatorContext } from 'pydantic-evals/evaluators';

// Define a test case
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

// Create a dataset and run
const dataset = new Dataset({
  cases: [case1],
  evaluators: [new IsInstance({ typeName: 'string' }), new MatchAnswer()],
});

async function answerQuestion(question: string): Promise<string> {
  return 'Paris';
}

const report = await dataset.evaluate(answerQuestion);
report.print({ includeInput: true, includeOutput: true });
```

## Core Concepts

The TypeScript port uses the same data model as the Python version. See [Core Concepts](evals/core-concepts.md) for a full explanation.

### Dataset

A `Dataset` holds a collection of test cases and shared evaluators:

```typescript
const dataset = new Dataset<string, string>({
  name: 'my-eval-suite',
  cases: [case1, case2],
  evaluators: [new EqualsExpected()],
  reportEvaluators: [new ConfusionMatrixEvaluator({ scoreKey: 'accuracy' })],
});
```

### Case

A `Case` defines a single test scenario:

```typescript
const myCase: Case<string, string> = {
  name: 'test_greeting',
  inputs: 'Say hello',
  expectedOutput: 'Hello!',
  metadata: { difficulty: 'easy' },
  evaluators: [new Contains({ value: 'Hello' })],
};
```

### Evaluator

Evaluators score the output of each case. Extend the `Evaluator` base class to write custom evaluators:

```typescript
class MyEvaluator extends Evaluator {
  async evaluate(ctx: EvaluatorContext<string, string>): Promise<number> {
    // Return a number, boolean, string, or { value, reason }
    return ctx.output === ctx.expectedOutput ? 1.0 : 0.0;
  }
}
```

Evaluators can return:

- A **number** (score)
- A **boolean** (assertion)
- A **string** (label)
- An object with `{ value, reason }` for detailed results
- A `Record<string, ...>` for multiple named results

## Built-in Evaluators

| Evaluator | Description |
|-----------|-------------|
| `Equals` | Exact equality with a specified value |
| `EqualsExpected` | Exact equality with the case's expected output |
| `Contains` | Check if output contains a value (strings, arrays, objects) |
| `IsInstance` | Check output type by constructor name |
| `MaxDuration` | Assert execution completed within a time limit (seconds) |
| `HasMatchingSpan` | Query the OTel span tree for matching spans |
| `LLMJudge` | Use an LLM (via OpenAI SDK) to evaluate output quality |

### Report Evaluators

Report evaluators run across all cases after individual evaluation:

| Evaluator | Description |
|-----------|-------------|
| `ConfusionMatrixEvaluator` | Build a confusion matrix from predictions and labels |
| `PrecisionRecallEvaluator` | Generate precision-recall curves with AUC |

## YAML/JSON Dataset Loading

Datasets can be loaded from YAML or JSON files with Zod schema validation:

```typescript
import { loadDatasetFromFile, datasetSchema } from 'pydantic-evals';
import { z } from 'zod';

// With default (unknown) types
const dataset = await loadDatasetFromFile('my-dataset.yaml');

// With typed schemas
const typedDataset = await loadDatasetFromFile('my-dataset.yaml', {
  schema: datasetSchema(z.string(), z.string(), z.object({ difficulty: z.string() })),
});
```

Evaluators in YAML use a compact syntax:

```yaml
cases:
  - name: test_case
    inputs: "What is 2+2?"
    expected_output: "4"
    evaluators:
      - EqualsExpected
      - Contains: "4"
      - MaxDuration:
          seconds: 5
evaluators:
  - IsInstance:
      typeName: string
```

## OTel Span Capture

The `withSpanCapture` utility captures OpenTelemetry spans during task execution, enabling evaluators like `HasMatchingSpan` to query the span tree:

```typescript
import { withSpanCapture } from 'pydantic-evals';
import { HasMatchingSpan } from 'pydantic-evals/evaluators';

const dataset = new Dataset({
  cases: [{ name: 'test', inputs: 'hello' }],
  evaluators: [
    new HasMatchingSpan({
      query: { nameContains: 'llm-call', minDuration: 0.001 },
    }),
  ],
});
```

Span queries support matching by name, attributes, duration, and hierarchical relationships (children, descendants, ancestors). See the Python [Span-Based Evaluation](evals/evaluators/span-based.md) docs for the full query syntax.

## Local Development

```bash
# Clone and install
cd src/ts/pydantic-evals
npm install

# Build
npm run build

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Lint and format
npm run lint
npm run format
```
