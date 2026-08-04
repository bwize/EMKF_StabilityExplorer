import { jenks } from "simple-statistics";
import ClassBreaksRenderer from "@arcgis/core/renderers/ClassBreaksRenderer.js";
import { CLASS_COUNT, TRACT_FILL_OPACITY } from "../config/appConfig.js";
import { getRampColors, withAlpha, OUTLINE_COLOR, OUTLINE_WIDTH } from "./colorRamps.js";
import { formatPercent } from "./format.js";

/**
 * Natural-breaks (Jenks) class boundaries — the same classification method
 * ArcGIS Pro's "Natural Breaks (Jenks)" uses. Returns an ascending array of
 * up to classCount+1 boundaries, or null if there's too little distinct
 * data to classify at all.
 */
export function computeNaturalBreaks(values, classCount = CLASS_COUNT) {
  const distinctCount = new Set(values).size;
  if (distinctCount < 2) return null;

  const k = Math.min(classCount, distinctCount);
  const breaks = jenks(values, k);
  if (!breaks) return null;

  // simple-statistics can repeat a boundary when one value dominates a
  // class; de-dupe while keeping ascending order.
  return breaks.filter((b, i) => i === 0 || b !== breaks[i - 1]);
}

// `color` is a ramp hex; fills are drawn at TRACT_FILL_OPACITY so the basemap
// shows through, while the outline keeps its own (full) alpha.
const fillSymbol = (color) => ({
  type: "simple-fill",
  color: withAlpha(color, TRACT_FILL_OPACITY),
  outline: { color: OUTLINE_COLOR, width: OUTLINE_WIDTH },
});

/**
 * Arcade that yields a tract's value on `field`, or null when the tract fails
 * the small-sample screen. A null lands in no class break, so excluded tracts
 * fall through to the renderer's defaultSymbol instead of being colored —
 * they stay on the map and stay clickable, they just aren't classified.
 *
 * Must agree with isExcluded() in lib/stats.js, which does the same test in
 * JS for the stats and the detail panel.
 */
function excludeAwareValueExpression(field, excludeFieldName) {
  return [
    `var flag = $feature["${excludeFieldName}"];`,
    `if (!IsEmpty(flag) && Lower(Text(flag)) == 'yes') { return null; }`,
    `return $feature["${field}"];`,
  ].join("\n");
}

/**
 * Build a natural-breaks ClassBreaksRenderer for `field`.
 *
 * @param field             layer field name to render
 * @param values            numeric values to classify on — the caller is
 *                          responsible for excluding nulls and small-sample
 *                          ("exclude" screen) tracts before this is called, so
 *                          outlier tracts don't distort the break points
 * @param direction         "high" | "low" | null — see fieldMeta.js
 * @param excludeFieldName  the layer's small-sample flag field, or null if the
 *                          layer doesn't have one (then nothing is screened out)
 * @returns {{ renderer: ClassBreaksRenderer, breaks: Array }}
 */
export function buildClassBreaksRenderer({ field, values, direction, excludeFieldName }) {
  // ClassBreaksRenderer takes either a field or an Arcade expression, not both.
  const valueSource = excludeFieldName
    ? { valueExpression: excludeAwareValueExpression(field, excludeFieldName) }
    : { field };
  const colors = getRampColors(direction);
  const boundaries = computeNaturalBreaks(values);

  // No-data tracts stay fainter than any class so they read as absent, not as
  // a sixth bucket.
  const defaultSymbol = {
    type: "simple-fill",
    color: [200, 200, 200, 0.35],
    outline: { color: OUTLINE_COLOR, width: OUTLINE_WIDTH },
  };

  if (!boundaries || boundaries.length < 2) {
    // Not enough spread to classify (e.g. every tract has the same value) —
    // one neutral bucket rather than a misleading multi-class split.
    const renderer = new ClassBreaksRenderer({
      ...valueSource,
      defaultSymbol,
      defaultLabel: "No data / small sample",
      classBreakInfos: [
        {
          minValue: -Infinity,
          maxValue: Infinity,
          symbol: fillSymbol(colors[Math.floor(colors.length / 2)]),
          label: "All tracts",
        },
      ],
    });
    return { renderer, breaks: [] };
  }

  const breaks = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const min = boundaries[i];
    const max = boundaries[i + 1];
    const color = colors[Math.min(i, colors.length - 1)];
    breaks.push({ min, max, color, label: `${formatPercent(min)} – ${formatPercent(max)}` });
  }

  const renderer = new ClassBreaksRenderer({
    ...valueSource,
    defaultSymbol,
    defaultLabel: "No data / small sample",
    classBreakInfos: breaks.map((b) => ({
      minValue: b.min,
      maxValue: b.max,
      symbol: fillSymbol(b.color),
      label: b.label,
    })),
  });

  return { renderer, breaks };
}
