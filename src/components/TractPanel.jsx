import { describeTract } from "../lib/geoid.js";
import { isFlagged, vulnerabilityPercentile, isExcluded } from "../lib/stats.js";
import { formatPercent, formatCount, formatOrdinal } from "../lib/format.js";
import { FIELD_META, SUMMARY_FIELDS } from "../config/fieldMeta.js";
import { GEOID_FIELD } from "../config/appConfig.js";

/** The raw-count strip shown for every tract, screened out or not. */
function TractSummary({ tract }) {
  return (
    <div className="tract-summary">
      {SUMMARY_FIELDS.map(({ id, label, description }) => (
        <div className="tract-summary-stat" key={id} title={description}>
          <span className="tract-summary-value">{formatCount(tract[id])}</span>
          <span className="tract-summary-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

export default function TractPanel({ tract, groupedFields, fieldStats, excludeFieldName, onClose }) {
  if (!tract) {
    return (
      <calcite-panel heading="Tract detail" class="tract-panel tract-panel-empty">
        <div className="tract-panel-placeholder">
          <calcite-icon icon="cursor-click" scale="l" />
          <p>Click a tract on the map to see all of its indicators.</p>
        </div>
      </calcite-panel>
    );
  }

  const { county, tractLabel } = describeTract(tract[GEOID_FIELD]);

  // A tract that fails the small-sample screen is left out of every
  // distribution (lib/stats.js) and isn't classified on the map, so showing
  // its indicator rates here would be showing numbers nothing else in the app
  // trusts. It gets the disclaimer and its raw counts, and stops there.
  if (isExcluded(tract, excludeFieldName)) {
    return (
      <calcite-panel heading={`Tract ${tractLabel}`} description={county} class="tract-panel">
        <calcite-action icon="x" text="Close" slot="header-actions-end" onClick={onClose} />

        <div className="tract-panel-body">
          <calcite-notice open icon="exclamation-mark-triangle" kind="warning" scale="s">
            <div slot="title">Small sample size — tract excluded</div>
            <div slot="message">
              This tract falls below the population/household screen. Its rates would swing
              too widely to be meaningful, so it is left out of the map classification and
              out of every region-wide statistic. Only its raw counts are shown.
            </div>
          </calcite-notice>

          <TractSummary tract={tract} />
        </div>
      </calcite-panel>
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

  return (
    <calcite-panel heading={`Tract ${tractLabel}`} description={county} class="tract-panel">
      <calcite-action icon="x" text="Close" slot="header-actions-end" onClick={onClose} />

      <div className="tract-panel-body">
        <TractSummary tract={tract} />

        {/* The count pill is the heading for the flagged list, so the two are
            wrapped together and spaced tighter than the panel's own rhythm —
            otherwise the flagged rows read as floating between the pill above
            and the full list below. */}
        <section className="flagged-block">
          <p className="tract-panel-hint">
            <calcite-icon icon="flag" scale="s" class="flag-icon" />
            {flaggedCount === 0
              ? " No indicators in the worst 10% of tracts region-wide."
              : ` ${flaggedCount} indicator${flaggedCount === 1 ? "" : "s"} in the worst 10% of tracts region-wide.`}
          </p>

          {flaggedCount > 0 && (
            <div className="flagged-summary">
              {flaggedRows.map(({ id, meta, value, group, rank }) => (
                <div
                  className="indicator-row is-flagged"
                  key={id}
                  title={
                    rank === null
                      ? meta.description
                      : `${meta.description} Only ${rank}% of tracts region-wide are as badly off or worse.`
                  }
                >
                  <span className="indicator-row-label">
                    {meta.label}
                    <span className="indicator-row-group">{group}</span>
                  </span>
                  <span className="indicator-row-value">
                    <calcite-icon icon="flag" scale="s" class="flag-icon" />
                    {formatPercent(value)}
                    {rank !== null && (
                      <span className="indicator-row-rank">({formatOrdinal(rank)} percentile)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* The full list repeats the flagged rows, so it needs a hard boundary
            and a name — without them the first group reads as a continuation
            of the flagged list rather than the start of everything. Sentence
            case here against the uppercase group captions below, so the two
            heading levels don't compete. */}
        <div className="indicator-sections">
          <h3 className="indicator-sections-heading">All indicators</h3>

          {/* Plain sections rather than collapsible calcite-blocks: at ~3-5
              rows a group, the block's heading, chevron, and border cost about
              as much height as the rows they wrap. Revisit if FIELD_GROUPS
              gets fine-grained again. */}
          {rows.map(([group, items]) => (
            <section className="indicator-section" key={group}>
              <h4 className="indicator-section-heading">{group}</h4>
              {items.map(({ id, meta, value, flagged }) => (
                <div
                  className={`indicator-row${flagged ? " is-flagged" : ""}`}
                  key={id}
                  title={meta.description}
                >
                  <span className="indicator-row-label">{meta.label}</span>
                  <span className="indicator-row-value">
                    {flagged && <calcite-icon icon="flag" scale="s" class="flag-icon" />}
                    {formatPercent(value)}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </calcite-panel>
  );
}
