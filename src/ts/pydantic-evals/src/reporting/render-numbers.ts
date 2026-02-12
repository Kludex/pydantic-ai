/**
 * Number/duration/percentage formatting utilities for evaluation reports.
 *
 * Port of pydantic_evals/reporting/render_numbers.py
 */

// Configuration constants
const VALUE_SIG_FIGS = 3;
const ABS_SIG_FIGS = 3;
const PERC_DECIMALS = 1;
const MULTIPLIER_ONE_DECIMAL_THRESHOLD = 100;
const BASE_THRESHOLD = 1e-2;
const MULTIPLIER_DROP_FACTOR = 10;

/**
 * Format a number for display in an evaluation report.
 *
 * - Integers: formatted with commas
 * - Floats: at least 1 decimal place and at least 3 significant figures
 */
export function defaultRenderNumber(value: number): string {
  if (Number.isInteger(value)) {
    return formatWithCommas(value, 0);
  }

  const absVal = Math.abs(value);

  /* v8 ignore next 3 -- unreachable: all zero values pass the integer check above */
  if (absVal === 0) {
    return value.toFixed(VALUE_SIG_FIGS);
  }

  let decimals: number;
  if (absVal >= 1) {
    const digits = Math.floor(Math.log10(absVal)) + 1;
    decimals = Math.max(1, VALUE_SIG_FIGS - digits);
  } else {
    const exponent = Math.floor(Math.log10(absVal));
    decimals = -exponent + VALUE_SIG_FIGS - 1;
  }

  return formatWithCommas(value, decimals);
}

/**
 * Format a percentage value.
 */
export function defaultRenderPercentage(value: number): string {
  const pct = value * 100;
  return `${pct.toFixed(VALUE_SIG_FIGS - 2)}%`;
}

/**
 * Format a duration difference. Returns null if old === new.
 */
export function defaultRenderNumberDiff(oldVal: number, newVal: number): string | null {
  if (oldVal === newVal) {
    return null;
  }

  if (Number.isInteger(oldVal) && Number.isInteger(newVal)) {
    const diff = newVal - oldVal;
    return diff >= 0 ? `+${diff}` : `${diff}`;
  }

  const delta = newVal - oldVal;
  const absDiffStr = renderSigned(delta, ABS_SIG_FIGS);
  const relDiffStr = renderRelative(newVal, oldVal, BASE_THRESHOLD);
  if (relDiffStr === null) {
    return absDiffStr;
  }
  return `${absDiffStr} / ${relDiffStr}`;
}

/**
 * Format a duration given in seconds.
 */
export function defaultRenderDuration(seconds: number): string {
  return renderDuration(seconds, false);
}

/**
 * Format a duration difference (in seconds) with an explicit sign. Returns null if equal.
 */
export function defaultRenderDurationDiff(oldVal: number, newVal: number): string | null {
  if (oldVal === newVal) {
    return null;
  }

  const absDiffStr = renderDuration(newVal - oldVal, true);
  const relDiffStr = renderRelative(newVal, oldVal, BASE_THRESHOLD);
  if (relDiffStr === null) {
    return absDiffStr;
  }
  return `${absDiffStr} / ${relDiffStr}`;
}

function renderSigned(val: number, sigFigs: number): string {
  const absStr = formatSigFigs(Math.abs(val), sigFigs);
  let s = absStr;
  // If result doesn't use scientific notation and lacks a decimal point, force '.0' suffix
  if (!s.includes('e') && !s.includes('.')) {
    s += '.0';
  }
  return `${val >= 0 ? '+' : '-'}${s}`;
}

function renderRelative(newVal: number, base: number, smallBaseThreshold: number): string | null {
  if (base === 0) {
    return null;
  }

  const delta = newVal - base;

  // For very small base values with huge changes, drop the relative indicator
  if (
    Math.abs(base) < smallBaseThreshold &&
    Math.abs(delta) > MULTIPLIER_DROP_FACTOR * Math.abs(base)
  ) {
    return null;
  }

  // Compute relative change as a percentage
  const relChange = (delta / base) * 100;
  const percStr = `${relChange >= 0 ? '+' : ''}${relChange.toFixed(PERC_DECIMALS)}%`;

  if (percStr === '+0.0%' || percStr === '-0.0%') {
    return null;
  }

  // Percentage vs multiplier
  if (Math.abs(delta) / Math.abs(base) <= 1) {
    return percStr;
  }

  const multiplier = newVal / base;
  if (Math.abs(multiplier) < MULTIPLIER_ONE_DECIMAL_THRESHOLD) {
    return `${multiplier.toFixed(1)}x`;
  }
  return `${Math.round(multiplier)}x`;
}

function renderDuration(seconds: number, forceSigned: boolean): string {
  if (seconds === 0) {
    return '0s';
  }

  let precision = 1;
  let value: number;
  let unit: string;
  const absSeconds = Math.abs(seconds);

  if (absSeconds < 1e-3) {
    value = seconds * 1_000_000;
    unit = '\u00b5s'; // µs
    if (Math.abs(value) >= 1) {
      precision = 0;
    }
  } else if (absSeconds < 1) {
    value = seconds * 1_000;
    unit = 'ms';
  } else {
    value = seconds;
    unit = 's';
  }

  const formatted = formatWithCommas(Math.abs(value), precision);
  if (forceSigned) {
    return `${value >= 0 ? '+' : '-'}${formatted}${unit}`;
  }
  return `${value < 0 ? '-' : ''}${formatted}${unit}`;
}

function formatWithCommas(value: number, decimals: number): string {
  const parts = Math.abs(value).toFixed(decimals).split('.');
  const intPart = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = value < 0 ? '-' : '';
  if (parts.length > 1 && parts[1]) {
    return `${sign}${intPart}.${parts[1]}`;
  }
  return `${sign}${intPart}`;
}

function formatSigFigs(value: number, sigFigs: number): string {
  /* v8 ignore next 3 -- callers ensure value > 0 (abs of nonzero delta) */
  if (value === 0) {
    return '0';
  }
  // Use toPrecision for significant figures, then clean up
  const s = value.toPrecision(sigFigs);
  // Add commas to the integer part if needed
  if (s.includes('e')) {
    return s;
  }
  const parts = s.split('.');
  const intPart = parts[0]!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (parts.length > 1) {
    return `${intPart}.${parts[1]}`;
  }
  return intPart;
}
