# Stability Tract Explorer

A React + ArcGIS Maps SDK app for exploring the KC-region ACS tract
indicators computed by `Code/01_acs_tracts.py` in the Stability project.
Pick any RATES indicator from the dropdown to choropleth it (natural-breaks
classification); click a tract to see every indicator for it, with the ones
in the worst 10% region-wide flagged.

This app is intentionally separate from the Python pipeline — it only reads
from the published ArcGIS Online FeatureServer, it never touches the Box
folder or the `.parquet`/`.csv` outputs directly.

## Branding

Colors and fonts follow the Ewing Marion Kauffman Foundation's
`Brand Guidelines_042425.pdf` — palette transcribed into
`src/config/brand.js`, wired into Calcite's theme via CSS custom properties
in `src/index.css` (`--calcite-color-brand`, `--calcite-font-family`, etc.),
Roboto + Public Sans loaded in `index.html`. Only UI chrome is branded — the
choropleth/flag colors in `lib/colorRamps.js` stay a semantic red/blue on
purpose, independent of brand.

The real logo lives in `src/assets/brand/`:

- `EMKF_Stacked_RGB.png` — the preferred lockup (icon + wordmark), used in
  `Header.jsx`. In dark mode it's flipped to solid white via a CSS
  `brightness(0) invert(1)` filter rather than a second exported asset —
  matches the "other usage" dark-background treatment in the brand PDF.
- `emkf-icon.png` — just the "K" mark, cropped programmatically from the
  file above (bounding-box detection on the alpha channel, not hand-redrawn)
  for use as the favicon (`public/favicon-kauffman.png`).

## Stack

- **Vite + React 19** (plain JS, not TypeScript)
- **`@arcgis/core`** (v5, npm/ESM build) — imperative Map/MapView/FeatureLayer, not the `<arcgis-map>` web components
- **`@esri/calcite-components`** (v5, Lit-based) — used as raw custom elements (`<calcite-shell>`, `<calcite-select>`, ...). React 19 doesn't need the old `@esri/calcite-components-react` wrapper package, so it isn't installed — see `src/hooks/useCalciteEvent.js` for why Calcite's custom events still need a manual `addEventListener`.
- **`simple-statistics`** for Jenks natural-breaks classification

## Setup

Node.js wasn't installed on this machine, so a portable copy was placed at
`C:\Users\brian\.local\node` and added to your **User** PATH — open a *new*
terminal for `node`/`npm` to be on PATH automatically. If a terminal still
doesn't see them, run:

```powershell
$env:PATH = "C:\Users\brian\.local\node;$env:PATH"
```

Then, from this folder:

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build -> dist/
```

## Project structure

```
src/
  config/
    appConfig.js     # FeatureServer URL, county lookup, class count, flag threshold
    fieldMeta.js      # <-- the file you'll actually edit: label/group/direction per indicator
  lib/
    geoid.js           # GEOID -> county name + tract number formatting
    stats.js            # z-score / percentile / "top 10%" flagging logic
    classify.js          # Jenks natural breaks -> ArcGIS ClassBreaksRenderer
    colorRamps.js         # choropleth color ramps (validated with the dataviz skill)
    layerFields.js         # intersects fieldMeta.js with whatever fields the live layer actually has
  components/
    MapView.jsx        # owns the Map/MapView/FeatureLayer lifecycle + click handling
    IndicatorPicker.jsx, Legend.jsx, TractPanel.jsx, Header.jsx, DataStatusNotice.jsx
  App.jsx               # data loading + state; wires everything together
```

## Adding or relabeling an indicator

Everything about an indicator (display label, which group it appears under,
its description, and its "vulnerability direction") lives in
**`src/config/fieldMeta.js`**. Nothing else needs to change — the dropdown,
legend, and detail panel are all built dynamically from whatever fields
`fieldMeta.js` lists that *also* exist on the live FeatureLayer.

```js
pct_cost_burden: {
  label: "Cost-Burdened Households",
  group: "Housing Cost",
  direction: "high",   // "high" | "low" | null
  description: "Renters and owners spending 30%+ of income on housing.",
},
```

`direction` controls two things at once: which end of the color ramp is
"dark red" on the map, and which end counts as the worst 10% in the tract
panel.

- `"high"` — a **high** value is worse (e.g. cost burden, unemployment).
- `"low"` — a **low** value is worse (e.g. labor force participation,
  bachelor's degree attainment). The color ramp is automatically reversed so
  dark red still means "more vulnerable," not "numerically larger."
- `null` — shown for context only, never flagged (used for indicators like
  self-employment share that don't have a defensible "worse" direction).

These directions are judgment calls (documented inline in `fieldMeta.js`) —
change any of them freely if you disagree.

## The live layer currently has fewer fields than the Python script computes

As of this writing, the hosted FeatureServer
(`Stability_Tracts/FeatureServer/0`) has **9** of the **35** RATES
indicators currently defined in `01_acs_tracts.py` — it was published from
an earlier version of the script, before the RATES dict was expanded. The
app handles this automatically:

- The dropdown, legend, and detail panel only ever show indicators that
  exist on the live layer (see `lib/layerFields.js`).
- A blue notice in the left panel ("Showing 9 of 35 tracked indicators")
  says so, and disappears on its own once resolved.
- One legacy field, `pct_long_commute`, exists only on the currently-hosted
  layer (an older name for what's now `pct_commute_gt45`) — it's mapped in
  `fieldMeta.js` so today's map still labels it correctly. Safe to delete
  once the layer is republished.

**To unlock the rest:** re-run `01_acs_tracts.py` and republish/overwrite
the `Stability_Tracts` feature layer in ArcGIS Online. No app code changes
needed.

## Other notes

- The Python script's `exclude` field (small-sample tracts — see
  `SCREEN` in `01_acs_tracts.py`) got renamed to `exclude_1` when ArcGIS
  Online published the layer. The app checks both spellings
  (`EXCLUDE_FIELD_CANDIDATES` in `appConfig.js`). An excluded tract is
  ignored throughout: dropped from the natural-breaks, z-score, and
  percentile-flag calculations, and drawn in the neutral "no data" fill
  rather than classified (the renderer's Arcade `valueExpression` returns
  null for it — see `classify.js`). It stays on the map and stays
  clickable; its detail panel shows the exclusion disclaimer and the four
  raw counts, and no indicator rates. The single test lives in
  `isExcluded()` in `lib/stats.js`.
- All 551 tract records are queried once on load (a few hundred KB) and
  kept client-side — switching the dropdown just re-classifies and
  reassigns the renderer, no network round-trip.
- You may see one console warning on load —
  `[@arcgis/core/Basemap] #load() Failed to load basemap (title: 'Basemap', id: 'gray-vector')`.
  The basemap renders correctly despite it (confirmed in testing); it
  appears to be a non-fatal internal retry inside `@arcgis/core` rather
  than anything the app is doing wrong. Worth a quick check next time the
  ArcGIS Maps SDK version bumps, in case it becomes a real problem.
