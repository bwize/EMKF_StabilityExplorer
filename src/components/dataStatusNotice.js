import { el } from "../dom.js";

/**
 * The FeatureServer was published from an earlier, smaller version of
 * Code/01_acs_tracts.py's RATES dict. This banner disappears on its own once
 * the layer is republished with the rest of the indicators — nothing to
 * maintain here.
 */
export function DataStatusNotice({ activeCount, totalCount }) {
  if (activeCount >= totalCount) return null;

  return el(
    "calcite-notice",
    { open: true, icon: "information", kind: "info", scale: "s", class: "data-status-notice" },
    el("div", { slot: "title" }, `Showing ${activeCount} of ${totalCount} tracked indicators`),
    el(
      "div",
      { slot: "message" },
      "The hosted layer hasn't been republished with the rest of the RATES fields from the " +
        "Python pipeline yet. Re-run 01_acs_tracts.py and republish to unlock the others.",
    ),
  );
}
