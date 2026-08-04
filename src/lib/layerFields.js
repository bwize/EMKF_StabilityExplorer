import { FIELD_META, FIELD_GROUPS } from "../config/fieldMeta.js";

/**
 * Every indicator this app knows how to render (see fieldMeta.js) that also
 * actually exists as a field on the live layer. The dropdown, legend, and
 * detail panel are all built from this list — never from the full FIELD_META
 * table directly — so the app degrades gracefully if the hosted layer has
 * fewer (or more) indicators than the app's config knows about.
 */
export function getActiveFieldIds(layerFieldNames) {
  const live = new Set(layerFieldNames.map((n) => n.toLowerCase()));
  return Object.keys(FIELD_META).filter((id) => live.has(id.toLowerCase()));
}

/** Active field ids bucketed by group, in FIELD_GROUPS order; empty groups dropped. */
export function groupActiveFields(activeFieldIds) {
  const byGroup = new Map(FIELD_GROUPS.map((g) => [g, []]));
  for (const id of activeFieldIds) {
    const group = FIELD_META[id]?.group ?? "Other";
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(id);
  }
  return [...byGroup.entries()].filter(([, ids]) => ids.length > 0);
}

/** Case-insensitively find whichever exclude-flag spelling the layer actually has. */
export function findField(layerFieldNames, candidates) {
  const byLower = new Map(layerFieldNames.map((n) => [n.toLowerCase(), n]));
  for (const candidate of candidates) {
    const match = byLower.get(candidate.toLowerCase());
    if (match) return match;
  }
  return null;
}
