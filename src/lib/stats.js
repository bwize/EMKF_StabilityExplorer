import { FLAG_QUANTILE } from "../config/appConfig.js";

// Minimum number of eligible (non-null, non-small-sample) tracts required
// before we'll compute a decile cutoff at all. Below this a "top 10%" isn't
// a meaningful statement.
const MIN_ELIGIBLE_N = 10;

/**
 * Mean/standard-deviation/sorted-values summary for one field, computed over
 * only the values the caller passes in (the app filters out nulls and
 * small-sample "exclude" tracts before calling this — see App.jsx).
 */
export function computeFieldStats(values) {
  const clean = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  const n = clean.length;
  if (n === 0) return { n: 0, mean: null, std: null, sorted: [] };

  const mean = clean.reduce((sum, v) => sum + v, 0) / n;
  const variance = clean.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const sorted = [...clean].sort((a, b) => a - b);

  return { n, mean, std, sorted };
}

/** Linear-interpolated percentile (p in [0,1]) over an ascending-sorted array. */
export function percentile(sorted, p) {
  if (!sorted || sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Standard (population) z-score of `value` against a field's distribution —
 * this is the same standardization the composite-index tool in ArcGIS Pro
 * applies (see the 01_acs_tracts.py docstring). Not shown in the UI directly
 * per product decision (raw values are more legible than z), but it's the
 * quantity "top 10%" formally refers to.
 */
export function zScore(value, stats) {
  if (!stats || stats.std === null || stats.std === 0) return 0;
  return (value - stats.mean) / stats.std;
}

/**
 * Where `value` sits in a field's distribution, counted from the VULNERABLE
 * end: 6 means "only 6% of tracts are as bad off or worse on this indicator."
 *
 * Deliberately direction-aware rather than a plain ascending percentile, so
 * the number reads the same way for every indicator — small is always bad.
 * (An ascending rank would put a flagged "high is worse" field at the 94th
 * percentile and a flagged "low is worse" field at the 6th, for tracts that
 * are equally badly off.) Returns null for context-only fields, which have no
 * worse end to count from.
 *
 * Clamped to a minimum of 1 so the worst tract in the region reads
 * "1st percentile" rather than "0th."
 */
export function vulnerabilityPercentile(value, direction, stats) {
  if (!direction || !stats || value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  if (stats.n === 0) return null;

  const atLeastAsBad =
    direction === "high"
      ? stats.sorted.filter((v) => v >= value).length
      : stats.sorted.filter((v) => v <= value).length;

  return Math.max(1, Math.round((atLeastAsBad / stats.n) * 100));
}

/**
 * Does this tract fail the Python small-sample screen? Excluded tracts are
 * left out of every distribution (so they can't drag a decile cutoff around),
 * are not classified on the map, and show only their raw counts in the detail
 * panel. The single source of truth for that test — the map's Arcade
 * equivalent in classify.js has to match it.
 */
export function isExcluded(record, excludeFieldName) {
  if (!record || !excludeFieldName) return false;
  return String(record[excludeFieldName]).toLowerCase() === "yes";
}

/**
 * Stats for every field in `fieldIds`, computed only over tracts that pass
 * the small-sample screen and have a non-null value — so a handful of
 * unreliable tiny-population tracts can't drag the decile cutoff around for
 * everyone else.
 */
export function computeAllFieldStats(records, fieldIds, excludeFieldName) {
  const eligible = excludeFieldName
    ? records.filter((r) => !isExcluded(r, excludeFieldName))
    : records;

  const map = new Map();
  for (const id of fieldIds) {
    const values = eligible
      .map((r) => r[id])
      .filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
    map.set(id, computeFieldStats(values));
  }
  return map;
}

/**
 * Is `value` in the worst FLAG_QUANTILE share of the distribution, given the
 * field's vulnerability direction?
 *
 * Because z-score is a strictly increasing linear function of the raw value
 * (for std > 0), "top decile of z" and "top decile of the raw value" are the
 * same set of tracts — so the cutoff is computed directly off `stats.sorted`
 * rather than off a separately-sorted z array.
 */
export function isFlagged(value, direction, stats, quantile = FLAG_QUANTILE) {
  if (!direction || !stats || value === null || value === undefined || Number.isNaN(value)) {
    return false;
  }
  if (stats.n < MIN_ELIGIBLE_N || stats.std === 0) return false;

  if (direction === "high") {
    return value >= percentile(stats.sorted, 1 - quantile);
  }
  if (direction === "low") {
    return value <= percentile(stats.sorted, quantile);
  }
  return false;
}
