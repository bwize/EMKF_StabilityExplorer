import { VALUE_DECIMALS } from "../config/fieldMeta.js";

/** Format a RATES value (already 0-100) as a percent string, e.g. "23.4%". */
export function formatPercent(value, decimals = VALUE_DECIMALS) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(decimals)}%`;
}

/** Format a whole number as an English ordinal, e.g. 6 -> "6th", 21 -> "21st". */
export function formatOrdinal(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const n = Math.round(value);
  const lastTwo = Math.abs(n) % 100;
  // 11/12/13 take "th" despite ending in 1/2/3.
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[Math.abs(n) % 10] ?? "th";
  return `${n}${suffix}`;
}

/** Format a plain count with thousands separators. */
export function formatCount(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return Math.round(value).toLocaleString("en-US");
}
