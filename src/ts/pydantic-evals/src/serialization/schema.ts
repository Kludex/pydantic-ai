/**
 * Zod schemas for dataset file format.
 *
 * Since TypeScript erases generics at runtime, users pass explicit Zod schemas
 * when loading from YAML/JSON to validate inputs, outputs, and metadata.
 */

import { z } from 'zod';

/**
 * Schema for an evaluator spec in serialized form.
 * Handles the short forms:
 * - string: evaluator name with no args
 * - { name: value }: single arg
 * - { name: { k1: v1, k2: v2 } }: kwargs
 */
export const evaluatorSpecSchema = z.union([
  z.string(),
  z.record(z.string(), z.unknown()).refine((obj) => Object.keys(obj).length === 1, {
    message: 'Evaluator spec object must have exactly one key (the evaluator name)',
  }),
]);

export type EvaluatorSpecRaw = z.infer<typeof evaluatorSpecSchema>;

/**
 * Create a case schema with custom types for inputs, output, and metadata.
 */
export function caseSchema<
  TInputs extends z.ZodType,
  TOutput extends z.ZodType,
  TMetadata extends z.ZodType,
>(inputsSchema: TInputs, outputSchema: TOutput, metadataSchema: TMetadata) {
  return z
    .object({
      name: z.string().optional().nullable(),
      inputs: inputsSchema,
      metadata: metadataSchema.optional().nullable(),
      expected_output: outputSchema.optional().nullable(),
      evaluators: z.array(evaluatorSpecSchema).optional().default([]),
    })
    .strict();
}

/**
 * Create a dataset schema with custom types for inputs, output, and metadata.
 */
export function datasetSchema<
  TInputs extends z.ZodType,
  TOutput extends z.ZodType,
  TMetadata extends z.ZodType,
>(inputsSchema: TInputs, outputSchema: TOutput, metadataSchema: TMetadata) {
  return z
    .object({
      $schema: z.string().optional(),
      name: z.string().optional().nullable(),
      cases: z.array(caseSchema(inputsSchema, outputSchema, metadataSchema)),
      evaluators: z.array(evaluatorSpecSchema).optional().default([]),
      report_evaluators: z.array(evaluatorSpecSchema).optional().default([]),
    })
    .strict();
}

/**
 * Default schemas using z.unknown() for all types.
 */
export const defaultCaseSchema = caseSchema(z.unknown(), z.unknown(), z.unknown());
export const defaultDatasetSchema = datasetSchema(z.unknown(), z.unknown(), z.unknown());
