import { el } from "../dom.js";
import { describeTract } from "../lib/geoid.js";
import { isFlagged, vulnerabilityPercentile, isExcluded } from "../lib/stats.js";
import { formatPercent, formatCount, formatOrdinal } from "../lib/format.js";
import { FIELD_META, SUMMARY_FIELDS } from "../config/fieldMeta.js";
import { GEOID_FIELD } from "../config/appConfig.js";
import { MOBILITY_META, mobilityCategoryFor } from "../config/mobilityCategory.js";

/**
 * The tract's composite Mobility Category, with the swatch it's drawn with on
 * the map. Sits at the very top of the panel, above the raw counts, because
 * it's the classification the default map is showing — a clicked tract should
 * name the bucket it was just seen in before it gets into per-indicator rates.
 *
 * Rendered for screened-out tracts too: "Excluded" is one of the categories,
 * so this is the one piece of the panel that reads the same either way.
 * Renders nothing if the layer has no category field, or the tract has no
 * value on it.
 */
function MobilityBadge({ tract, mobilityFieldName }) {
  if (!mobilityFieldName) return null;
  const category = mobilityCategoryFor(tract[mobilityFieldName]);
  if (!category) return null;

  return el(
    "div",
    { class: "mobility-badge", title: MOBILITY_META.description },
    el("span", {
      // An unrecognized category has no fill color of its own and falls back
      // to the neutral swatch the stylesheet gives an uncolored one.
      class: "mobility-badge-swatch",
      style: category.color ? { backgroundColor: category.color } : null,
    }),
    el(
      "span",
      { class: "mobility-badge-text" },
      el("span", { class: "mobility-badge-caption" }, MOBILITY_META.label),
      el("span", { class: "mobility-badge-value" }, category.label),
    ),
  );
}

/** The summary strip (counts and shares) shown for every tract, screened out or not. */
function TractSummary({ tract }) {
  return el(
    "div",
    { class: "tract-summary" },
    SUMMARY_FIELDS.map(({ label, description, format, value }) =>
      el(
        "div",
        { class: "tract-summary-stat", title: description },
        el(
          "span",
          { class: "tract-summary-value" },
          format === "percent" ? formatPercent(value(tract)) : formatCount(value(tract)),
        ),
        el("span", { class: "tract-summary-label" }, label),
      ),
    ),
  );
}

/**
 * Detail panel for one tract — or one ZIP code, when `place` is given.
 *
 * `place` overrides the tract-derived heading and description, and `unit`
 * names what the percentiles and flags are measured against: a ZIP is ranked
 * among the region's ZIP codes (`fieldStats` built from ZIP records), not
 * among tracts, since a ZIP-wide rate averages over many tracts and would
 * almost never reach the tract distribution's tails.
 *
 * @param {{ heading: string, description: string, unit: string }} [place]
 */
export function TractPanel({
  tract,
  place,
  groupedFields,
  fieldStats,
  excludeFieldName,
  mobilityFieldName,
  onClose,
}) {
  if (!tract) {
    return el(
      "calcite-panel",
      { heading: "Tract detail", scale: "l", class: "tract-panel tract-panel-empty" },
      el(
        "div",
        { class: "tract-panel-placeholder" },
        el("calcite-icon", { icon: "cursor-click", scale: "l" }),
        el("p", null, "Click a tract on the map to see all of its indicators."),
      ),
    );
  }

  const { heading, description, unit } = place ?? (() => {
    const { county, tractLabel } = describeTract(tract[GEOID_FIELD]);
    return { heading: `Tract ${tractLabel}`, description: county, unit: "tracts" };
  })();
  const unitSingular = unit === "tracts" ? "tract" : "ZIP code";

  // A tract that fails the small-sample screen is left out of every
  // distribution (lib/stats.js) and isn't classified on the map, so showing
  // its indicator rates here would be showing numbers nothing else in the app
  // trusts. It gets the disclaimer and its raw counts, and stops there.
  if (isExcluded(tract, excludeFieldName)) {
    return el(
      "calcite-panel",
      { heading, description, scale: "l", class: "tract-panel" },
      el("calcite-action", { icon: "x", text: "Close", slot: "header-actions-end", onClick: onClose }),
      el(
        "div",
        { class: "tract-panel-body" },
        MobilityBadge({ tract, mobilityFieldName }),
        el(
          "calcite-notice",
          { open: true, icon: "exclamation-mark-triangle", kind: "warning", scale: "m" },
          el("div", { slot: "title" }, `Small sample size — ${unitSingular} excluded`),
          el(
            "div",
            { slot: "message" },
            `This ${unitSingular} falls below the population/household screen. Its rates would swing ` +
              "too widely to be meaningful, so it is left out of the map classification and " +
              "out of every region-wide statistic. Only its summary figures are shown.",
          ),
        ),
        TractSummary({ tract }),
      ),
    );
  }

  // Resolve once per render so the summary count and the row list agree.
  const rows = groupedFields.map(([group, ids]) => [
    group,
    ids.map((id) => {
      const meta = FIELD_META[id];
      const value = tract[id];
      const stats = fieldStats.get(id);
      return {
        id,
        meta,
        value,
        flagged: isFlagged(value, meta.direction, stats),
        rank: vulnerabilityPercentile(value, meta.direction, stats),
      };
    }),
  ]);
  // Flagged indicators are pulled up into a summary list at the top of the
  // panel and left out of the grouped list below, so each indicator appears
  // exactly once. Groups whose every indicator was flagged drop out entirely.
  const flaggedRows = rows.flatMap(([group, items]) =>
    items.filter((r) => r.flagged).map((r) => ({ ...r, group })),
  );
  const flaggedCount = flaggedRows.length;
  const unflaggedGroups = rows
    .map(([group, items]) => [group, items.filter((r) => !r.flagged)])
    .filter(([, items]) => items.length > 0);

  return el(
    "calcite-panel",
    { heading, description, scale: "l", class: "tract-panel" },
    el("calcite-action", { icon: "x", text: "Close", slot: "header-actions-end", onClick: onClose }),

    el(
      "div",
      { class: "tract-panel-body" },
      MobilityBadge({ tract, mobilityFieldName }),
      TractSummary({ tract }),

      // The count pill is the heading for the flagged list, so the two are
      // wrapped together and spaced tighter than the panel's own rhythm —
      // otherwise the flagged rows read as floating between the pill above
      // and the full list below.
      el(
        "section",
        { class: "flagged-block" },
        el(
          "p",
          { class: "tract-panel-hint" },
          el("calcite-icon", { icon: "flag", scale: "m", class: "flag-icon" }),
          flaggedCount === 0
            ? ` No indicators in the worst 10% of ${unit} region-wide.`
            : ` ${flaggedCount} indicator${flaggedCount === 1 ? "" : "s"} in the worst 10% of ${unit} region-wide.`,
        ),

        flaggedCount > 0 &&
          el(
            "div",
            { class: "flagged-summary" },
            flaggedRows.map(({ id, meta, value, group, rank }) =>
              el(
                "div",
                {
                  class: "indicator-row is-flagged",
                  title:
                    rank === null
                      ? meta.description
                      : `${meta.description} Only ${rank}% of ${unit} region-wide are as badly off or worse.`,
                },
                el(
                  "span",
                  { class: "indicator-row-label" },
                  meta.label,
                  el("span", { class: "indicator-row-group" }, group),
                ),
                el(
                  "span",
                  { class: "indicator-row-value" },
                  el("calcite-icon", { icon: "flag", scale: "m", class: "flag-icon" }),
                  formatPercent(value),
                  rank !== null && el("span", { class: "indicator-row-rank" }, `(${formatOrdinal(rank)} percentile)`),
                ),
              ),
            ),
          ),
      ),

      // The remaining (unflagged) indicators, below a hard boundary and a
      // name so the first group doesn't read as a continuation of the
      // flagged list. Sentence case here against the uppercase group captions
      // below, so the two heading levels don't compete.
      unflaggedGroups.length > 0 &&
        el(
          "div",
          { class: "indicator-sections" },
          el(
            "h3",
            { class: "indicator-sections-heading" },
            flaggedCount > 0 ? "Other indicators" : "All indicators",
          ),

          // Plain sections rather than collapsible calcite-blocks: at ~3-5
          // rows a group, the block's heading, chevron, and border cost about
          // as much height as the rows they wrap. Revisit if FIELD_GROUPS
          // gets fine-grained again.
          unflaggedGroups.map(([group, items]) =>
            el(
              "section",
              { class: "indicator-section" },
              el("h4", { class: "indicator-section-heading" }, group),
              items.map(({ meta, value, rank }) =>
                el(
                  "div",
                  {
                    class: "indicator-row",
                    title:
                      rank === null
                        ? meta.description
                        : `${meta.description} ${rank}% of ${unit} region-wide are as badly off or worse.`,
                  },
                  el("span", { class: "indicator-row-label" }, meta.label),
                  el(
                    "span",
                    { class: "indicator-row-value" },
                    formatPercent(value),
                    rank !== null && el("span", { class: "indicator-row-rank" }, `(${formatOrdinal(rank)} percentile)`),
                  ),
                ),
              ),
            ),
          ),
        ),
    ),
  );
}
