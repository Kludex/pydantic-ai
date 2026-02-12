/**
 * Report-level analysis types: confusion matrix, precision-recall, scalar, table.
 */

export interface ConfusionMatrix {
  type: 'confusion_matrix';
  title: string;
  description?: string | null;
  /** Ordered list of class labels (used for both axes). */
  classLabels: string[];
  /** matrix[expectedIdx][predictedIdx] = count of cases. */
  matrix: number[][];
}

export interface PrecisionRecallPoint {
  threshold: number;
  precision: number;
  recall: number;
}

export interface PrecisionRecallCurve {
  /** Name of this curve (e.g., experiment name or evaluator name). */
  name: string;
  /** Points on the curve, ordered by threshold. */
  points: PrecisionRecallPoint[];
  /** Area under the precision-recall curve. */
  auc?: number | null;
}

export interface PrecisionRecall {
  type: 'precision_recall';
  title: string;
  description?: string | null;
  curves: PrecisionRecallCurve[];
}

export interface ScalarResult {
  type: 'scalar';
  title: string;
  description?: string | null;
  value: number;
  /** Optional unit label (e.g., '%', 'ms'). */
  unit?: string | null;
}

export interface TableResult {
  type: 'table';
  title: string;
  description?: string | null;
  /** Column headers. */
  columns: string[];
  /** Row data, one array per row. */
  rows: (string | number | boolean | null)[][];
}

/** Discriminated union of all report-level analysis types. */
export type ReportAnalysis = ConfusionMatrix | PrecisionRecall | ScalarResult | TableResult;
