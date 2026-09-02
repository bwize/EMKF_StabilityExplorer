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
      // Hatched and unrecognized categories have no fill color of their own:
      // the hatch is drawn in CSS, and an unrecognized category falls back to
      // the neutral swatch the stylesheet gives an uncolored one.
      class: `mobility-badge-swatch${category.hatched ? " is-hatched" : ""}`,
      style: category.hatched || !category.color ? null : { backgroundColor: category.color },
    }),
    el(
      "span",
      { class: "mobility-badge-text" },
      el("span", { class: "mobility-badge-caption" }, MOBILITY_META.label),
      el("span", { class: "mobility-badge-value" }, category.label),
    ),
  );
}

/** The raw-count strip shown for every tract, screened out or not. */
function TractSummary({ tract }) {
  return el(
    "div",
    { class: "tract-summary" },
    SUMMARY_FIELDS.map(({ id, label, description }) =>
      el(
        "div",
        { class: "tract-summary-stat", title: description },
        el("span", { class: "tract-summary-value" }, formatCount(tract[id])),
        el("span", { class: "tract-summary-label" }, label),
      ),
    ),
  );
}

export function TractPanel({
  tract,
  groupedFields,
  fieldStats,
  excludeFieldName,
  mobilityFieldName,
  onClose,
}) {
  if (!tract) {
    return el(
      "calcite-panel",
      { heading: "Tract detail", class: "tract-panel tract-panel-empty" },
      el(
        "div",
        { class: "tract-panel-placeholder" },
        el("calcite-icon", { icon: "cursor-click", scale: "l" }),
        el("p", null, "Click a tract on the map to see all of its indicators."),
      ),
    );
  }

  const { county, tractLabel } = describeTract(tract[GEOID_FIELD]);

  // A tract that fails the small-sample screen is left out of every
  // distribution (lib/stats.js) and isn't classified on the map, so showing
  // its indicator rates here would be showing numbers nothing else in the app
  // trusts. It gets the disclaimer and its raw counts, and stops there.
  if (isExcluded(tract, excludeFieldName)) {
    return el(
      "calcite-panel",
      { heading: `Tract ${tractLabel}`, description: county, class: "tract-panel" },
      el("calcite-action", { icon: "x", text: "Close", slot: "header-actions-end", onClick: onClose }),
      el(
        "div",
        { class: "tract-panel-body" },
        MobilityBadge({ tract, mobilityFieldName }),
        el(
          "calcite-notice",
          { open: true, icon: "exclamation-mark-triangle", kind: "warning", scale: "s" },
          el("div", { slot: "title" }, "Small sample size — tract excluded"),
          el(
            "div",
            { slot: "message" },
            "This tract falls below the population/household screen. Its rates would swing " +
              "too widely to be meaningful, so it is left out of the map classification and " +
              "out of every region-wide statistic. Only its raw counts are shown.",
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
      return { id, meta, value, flagged: isFlagged(value, meta.direction, fieldStats.get(id)) };
    }),
  ]);
  // Flagged indicators are pulled up into a summary list at the top of the
  // panel and then shown again in their own group below — the duplication is
  // deliberate so the worst-off values are visible without scrolling.
  const flaggedRows = rows.flatMap(([group, items]) =>
    items
      .filter((r) => r.flagged)
      .map((r) => ({
        ...r,
        group,
        rank: vulnerabilityPercentile(r.value, r.meta.direction, fieldStats.get(r.id)),
      })),
  );
  const flaggedCount = flaggedRows.length;

  return el(
    "calcite-panel",
    { heading: `Tract ${tractLabel}`, description: county, class: "tract-panel" },
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
          el("calcite-icon", { icon: "flag", scale: "s", class: "flag-icon" }),
          flaggedCount === 0
            ? " No indicators in the worst 10% of tracts region-wide."
            : ` ${flaggedCount} indicator${flaggedCount === 1 ? "" : "s"} in the worst 10% of tracts region-wide.`,
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
                      : `${meta.description} Only ${rank}% of tracts region-wide are as badly off or worse.`,
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
                  el("calcite-icon", { icon: "flag", scale: "s", class: "flag-icon" }),
                  formatPercent(value),
                  rank !== null && el("span", { class: "indicator-row-rank" }, `(${formatOrdinal(rank)} percentile)`),
                ),
              ),
            ),
          ),
      ),

      // The full list repeats the flagged rows, so it needs a hard boundary
      // and a name — without them the first group reads as a continuation
      // of the flagged list rather than the start of everything. Sentence
      // case here against the uppercase group captions below, so the two
      // heading levels don't compete.
      el(
        "div",
        { class: "indicator-sections" },
        el("h3", { class: "indicator-sections-heading" }, "All indicators"),

        // Plain sections rather than collapsible calcite-blocks: at ~3-5
        // rows a group, the block's heading, chevron, and border cost about
        // as much height as the rows they wrap. Revisit if FIELD_GROUPS
        // gets fine-grained again.
        rows.map(([group, items]) =>
          el(
            "section",
            { class: "indicator-section" },
            el("h4", { class: "indicator-section-heading" }, group),
            items.map(({ id, meta, value, flagged }) =>
              el(
                "div",
                { class: `indicator-row${flagged ? " is-flagged" : ""}`, title: meta.description },
                el("span", { class: "indicator-row-label" }, meta.label),
                el(
                  "span",
                  { class: "indicator-row-value" },
                  flagged && el("calcite-icon", { icon: "flag", scale: "s", class: "flag-icon" }),
                  formatPercent(value),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
