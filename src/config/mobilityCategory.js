// ---------------------------------------------------------------------------
// The composite Mobility Category classification.
//
// Unlike everything in fieldMeta.js — which describes the numeric RATES
// indicators from 01_acs_tracts.py — this is a single *categorical* string
// field joined onto the layer alongside PCA_Score / Percentile. It gets its
// own config module (and its own renderer, see lib/classify.js) because none
// of the rate machinery applies to it: there are no natural breaks to compute,
// no distribution to rank a tract against, and no percentage to format.
//
// This is the map the app opens on — the one-look summary of the region — so
// the rate indicators in the dropdown read as drill-downs from it.
// ---------------------------------------------------------------------------

// Field name on the hosted layer. Resolved case-insensitively through
// findField() (lib/layerFields.js) the same way the exclude flag is, since
// ArcGIS Online has renamed fields on republish before; if the layer doesn't
// have it at all, the app silently falls back to the first rate indicator.
export const MOBILITY_FIELD = "Mobility_Category";

// Dropdown section this sits in, above the rate-indicator groups.
export const MOBILITY_GROUP = "Overview";

export const MOBILITY_META = {
  label: "Mobility Category",
  description:
    "Composite classification of each tract's economic mobility, derived from the tract's PCA score across poverty, near-poverty, educational attainment, and unemployment.",
  legendHint: "Darker = more limited mobility. Hatched tracts are excluded.",
};

// Ordered least- to most-limited; the legend, and the light -> dark reading of
// the map, both follow this order. The four non-excluded colors are the same
// four steps as CHOROPLETH_RAMP (ColorBrewer YlGnBu 4-class, lib/colorRamps.js)
// so the category map and the rate maps read as one visual system — but they're
// spelled out here rather than imported, because these are colors specified for
// these categories, not a ramp that should follow along if CHOROPLETH_RAMP is
// ever re-picked.
//
// "Excluded" is drawn as a hatch rather than a fifth color: it isn't the far
// end of the scale, it's the absence of a classification (those are exactly the
// tracts that fail the small-sample screen — see EXCLUDE_FIELD_CANDIDATES in
// appConfig.js), and a hatch says "not applicable" where a fifth swatch would
// say "even worse than the fourth."
export const MOBILITY_CATEGORIES = [
  { value: "Existing Mobility", label: "Existing Mobility", color: "#ffffcc" },
  { value: "Limited Mobility", label: "Limited Mobility", color: "#a1dab4" },
  { value: "Very Limited Mobility", label: "Very Limited Mobility", color: "#41b6c4" },
  { value: "Extremely Limited Mobility", label: "Extremely Limited Mobility", color: "#253494" },
  { value: "Excluded", label: "Excluded (small sample)", color: null, hatched: true },
];

// Hatch line color for the "Excluded" polygons on the map. Mid-gray, to sit in
// the same register as the polygon outlines (OUTLINE_COLOR in colorRamps.js)
// rather than competing with the four category fills.
export const MOBILITY_HATCH_COLOR = [110, 110, 110, 1];

/**
 * The category entry for a tract's raw field value, or null when the tract has
 * no value at all. A value the table doesn't know about is passed through as
 * its own unstyled entry rather than dropped, so a category added to the layer
 * before it's added here still shows up in the tract panel (just without a
 * color) instead of vanishing.
 */
export function mobilityCategoryFor(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const match = MOBILITY_CATEGORIES.find(
    (c) => c.value.toLowerCase() === String(value).trim().toLowerCase(),
  );
  return match ?? { value: String(value), label: String(value), color: null };
}
