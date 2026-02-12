/**
 * LLMJudge evaluator using the OpenAI SDK (optional dependency).
 *
 * Judges whether the output of a language model meets the criteria of a provided rubric.
 */

import type { EvaluationReason, EvaluationScalar, EvaluatorOutput } from '../types.js';
import type { OutputConfig } from './common.js';
import { updateCombinedOutput } from './common.js';
import type { EvaluatorContext } from './context.js';
import { Evaluator } from './evaluator.js';

export interface GradingOutput {
  reason: string;
  pass: boolean;
  score: number;
}

let defaultJudgeModel = 'gpt-4o';

/**
 * Set the default model used for LLM judging.
 */
export function setDefaultJudgeModel(model: string): void {
  defaultJudgeModel = model;
}

/**
 * Get the default model used for LLM judging.
 */
export function getDefaultJudgeModel(): string {
  return defaultJudgeModel;
}

/**
 * Judge whether the output meets the criteria of a provided rubric using an LLM.
 */
export class LLMJudge extends Evaluator {
  readonly rubric: string;
  readonly model: string | null;
  readonly includeInput: boolean;
  readonly includeExpectedOutput: boolean;
  readonly score: OutputConfig | false;
  readonly assertion: OutputConfig | false;

  constructor(opts: {
    rubric: string;
    model?: string | null;
    includeInput?: boolean;
    includeExpectedOutput?: boolean;
    score?: OutputConfig | false;
    assertion?: OutputConfig | false;
  }) {
    super();
    this.rubric = opts.rubric;
    this.model = opts.model ?? null;
    this.includeInput = opts.includeInput ?? false;
    this.includeExpectedOutput = opts.includeExpectedOutput ?? false;
    this.score = opts.score ?? false;
    this.assertion = opts.assertion ?? { includeReason: true };
  }

  protected getFields() {
    return {
      rubric: this.rubric,
      model: this.model,
      includeInput: this.includeInput,
      includeExpectedOutput: this.includeExpectedOutput,
      score: this.score,
      assertion: this.assertion,
    };
  }
  protected getDefaults() {
    return {
      model: null,
      includeInput: false,
      includeExpectedOutput: false,
      score: false,
      assertion: { includeReason: true },
    };
  }

  async evaluate(ctx: EvaluatorContext): Promise<EvaluatorOutput> {
    const gradingOutput = await callJudge({
      output: ctx.output,
      rubric: this.rubric,
      model: this.model ?? defaultJudgeModel,
      inputs: this.includeInput ? ctx.inputs : undefined,
      expectedOutput: this.includeExpectedOutput ? ctx.expectedOutput : undefined,
    });

    const output: Record<string, EvaluationScalar | EvaluationReason> = {};
    const includeBoth = this.score !== false && this.assertion !== false;
    const evaluationName = this.getDefaultEvaluationName();

    if (this.score !== false) {
      const defaultName = includeBoth ? `${evaluationName}_score` : evaluationName;
      updateCombinedOutput(
        output,
        gradingOutput.score,
        gradingOutput.reason,
        this.score,
        defaultName,
      );
    }

    if (this.assertion !== false) {
      const defaultName = includeBoth ? `${evaluationName}_pass` : evaluationName;
      updateCombinedOutput(
        output,
        gradingOutput.pass,
        gradingOutput.reason,
        this.assertion,
        defaultName,
      );
    }

    return output;
  }
}

/**
 * Call the LLM judge using the OpenAI SDK.
 */
async function callJudge(opts: {
  output: unknown;
  rubric: string;
  model: string;
  inputs?: unknown;
  expectedOutput?: unknown;
}): Promise<GradingOutput> {
  // Dynamic import — OpenAI is an optional dependency
  let OpenAI: typeof import('openai').default;
  try {
    const mod = await import('openai');
    OpenAI = mod.default;
  } catch {
    throw new Error(
      'The `openai` package is required for LLMJudge. Install it with: npm install openai',
    );
  }

  const client = new OpenAI();

  // Build the user prompt
  const sections: string[] = [];
  if (opts.inputs !== undefined) {
    sections.push(`<Input>\n${stringify(opts.inputs)}\n</Input>`);
  }
  sections.push(`<Output>\n${stringify(opts.output)}\n</Output>`);
  sections.push(`<Rubric>\n${opts.rubric}\n</Rubric>`);
  if (opts.expectedOutput !== undefined) {
    sections.push(`<ExpectedOutput>\n${stringify(opts.expectedOutput)}\n</ExpectedOutput>`);
  }

  const systemPrompt =
    'You are grading output according to a user-specified rubric. ' +
    'If the statement in the rubric is true, then the output passes the test. ' +
    'You respond with a JSON object with this structure: {reason: string, pass: boolean, score: number}';

  const response = await client.chat.completions.create({
    model: opts.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: sections.join('\n') },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('LLMJudge received empty response from model');
  }

  const parsed = JSON.parse(content) as Record<string, unknown>;
  return {
    reason: String(parsed.reason ?? ''),
    pass: Boolean(parsed.pass),
    score: Number(parsed.score ?? 0),
  };
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
