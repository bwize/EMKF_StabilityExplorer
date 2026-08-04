/**
 * The FeatureServer was published from an earlier, smaller version of
 * Code/01_acs_tracts.py's RATES dict. This banner disappears on its own once
 * the layer is republished with the rest of the indicators — nothing to
 * maintain here.
 */
export default function DataStatusNotice({ activeCount, totalCount }) {
  if (activeCount >= totalCount) return null;

  return (
    <calcite-notice open icon="information" kind="info" scale="s" class="data-status-notice">
      <div slot="title">Showing {activeCount} of {totalCount} tracked indicators</div>
      <div slot="message">
        The hosted layer hasn't been republished with the rest of the RATES fields from the
        Python pipeline yet. Re-run 01_acs_tracts.py and republish to unlock the others.
      </div>
    </calcite-notice>
  );
}
