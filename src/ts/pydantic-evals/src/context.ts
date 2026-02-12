/**
 * AsyncLocalStorage-based context for evaluation task runs.
 *
 * Provides setEvalAttribute() and incrementEvalMetric() that work
 * within the scope of a running task evaluation (the TS equivalent
 * of Python's ContextVar-based approach).
 */

import { AsyncLocalStorage } from 'node:async_hooks';

interface TaskRun {
  attributes: Record<string, unknown>;
  metrics: Record<string, number>;
}

const taskRunStorage = new AsyncLocalStorage<TaskRun>();

/**
 * Run a function within a new task-run context.
 * Returns the result along with the attributes and metrics collected.
 */
export async function withTaskRun<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; attributes: Record<string, unknown>; metrics: Record<string, number> }> {
  const taskRun: TaskRun = { attributes: {}, metrics: {} };
  const result = await taskRunStorage.run(taskRun, fn);
  return { result, attributes: taskRun.attributes, metrics: taskRun.metrics };
}

/**
 * Set an attribute on the current task run.
 * No-op if called outside of a task run.
 */
export function setEvalAttribute(name: string, value: unknown): void {
  const taskRun = taskRunStorage.getStore();
  if (taskRun) {
    taskRun.attributes[name] = value;
  }
}

/**
 * Increment a metric on the current task run.
 * No-op if called outside of a task run.
 */
export function incrementEvalMetric(name: string, amount: number): void {
  const taskRun = taskRunStorage.getStore();
  if (taskRun) {
    const currentValue = taskRun.metrics[name] ?? 0;
    const newValue = currentValue + amount;
    // Avoid recording a metric that is always zero
    if (currentValue === 0 && newValue === 0) return;
    taskRun.metrics[name] = newValue;
  }
}
