// ---------------------------------------------------------------------------
// Choropleth color ramp.
//
// CHOROPLETH_RAMP (ColorBrewer "YlGnBu", 4-class) reads light -> dark as
// low -> high on the RAW value, and has one step per class (CLASS_COUNT = 4
// in appConfig.js — change the two together). For fields where
// direction === "low" (a low value is the worse end — e.g. labor force
// participation), the ramp is reversed so the worst-off tracts still land on
// the dark navy end: color always means "more vulnerable," never
// "numerically larger."
//
// This one ramp is used for every field, including direction: null ones. An
// earlier version gave unjudged fields a separate ramp so the map wouldn't
// imply a value judgment the data doesn't support; that distinction is gone,
// so a direction: null field now looks like a judged one on the map. The
// legend hint (see Legend.jsx) is what carries the difference.
//
// Run through the dataviz skill's validate_palette.js in --ordinal mode:
// lightness-monotonicity and adjacent-step separation pass. Two checks fail
// and are accepted deliberately:
//   - Light-end contrast — ColorBrewer's palest step is intentionally
//     near-white. The check assumes a swatch floating on a bare surface;
//     here every class is a polygon fill with its own outline (see
//     classify.js), which is the standard cartographic mitigation.
//   - Single hue — the validator wants one hue, and YlGnBu spans 163°.
//     Multi-hue sequential schemes are standard practice in cartography
//     precisely because they hold up over a busy basemap; the ordering cue
//     that matters (monotone lightness) passes.
// ---------------------------------------------------------------------------

export const CHOROPLETH_RAMP = ["#ffffcc", "#a1dab4", "#41b6c4", "#253494"];

// Outline for every choropleth polygon, all directions.
export const OUTLINE_COLOR = [110, 110, 110, 0.5];
export const OUTLINE_WIDTH = 0.5;

// Selection/highlight accent — used for the clicked-tract outline overlay.
export const SELECTION_COLOR = "#00c0ff";

/**
 * "#rrggbb" -> [r, g, b, alpha], the array form ArcGIS symbols take. Lets the
 * ramps stay readable hex constants while fills carry a partial alpha.
 */
export function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
}

/**
 * Colors for a field's class breaks, ordered to match ascending class index
 * (class 0 = lowest raw-value bucket ... class N = highest raw-value bucket).
 */
export function getRampColors(direction) {
  if (direction === "low") return [...CHOROPLETH_RAMP].reverse();
  return CHOROPLETH_RAMP;
}
