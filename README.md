# Stability Tract Explorer

A vanilla-JS + ArcGIS Maps SDK app for exploring the KC-region ACS tract
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
  `components/header.js`. In dark mode it's flipped to solid white via a CSS
  `brightness(0) invert(1)` filter rather than a second exported asset —
  matches the "other usage" dark-background treatment in the brand PDF.
- `emkf-icon.png` — just the "K" mark, cropped programmatically from the
  file above (bounding-box detection on the alpha channel, not hand-redrawn)
  for use as the favicon (`favicon-kauffman.png`, project root).

## Stack — no npm, no build step

This app is plain static files: `index.html` + hand-written ES modules,
served as-is. There is no `package.json`, no `node_modules`, no bundler, and
nothing to `npm install`. Everything third-party loads from a CDN at
runtime, wired together with a browser-native `<script type="importmap">`
in `index.html`:

- **`@arcgis/core`** (v5) — loaded from Esri's ESM CDN (`js.arcgis.com/5.1`).
  Imperative Map/MapView/FeatureLayer, not the `<arcgis-map>` web
  components. **Caveat:** Esri's own docs describe this ESM CDN path as
  intended for testing/prototyping, not production — it isn't tree-shaken
  and costs more HTTP requests than a bundled build. Accepted deliberately
  here: this is a low-traffic internal single-page tool, and the trade-off
  is page weight, not correctness or security. If traffic or performance
  ever becomes a real concern, the fix is reintroducing a bundler (Vite,
  esbuild, Rollup) for `@arcgis/core` specifically — nothing else in this
  app depends on one.
- **`@esri/calcite-components`** (v5, Lit-based) — also from
  `js.arcgis.com/5.1`, used as raw custom elements (`<calcite-shell>`,
  `<calcite-select>`, ...). Unlike `@arcgis/core`, Esri documents this CDN
  path as fully supported for production. The script tag self-registers
  every `calcite-*` element; no `defineCustomElements()` call needed.
- **`simple-statistics`** — just the `jenks()` function, for natural-breaks
  classification (`lib/classify.js`). Esri doesn't host this, so it's
  mapped to `esm.sh` instead (a CDN that mirrors npm packages as real ES
  modules), pinned to an exact version in the import map.

Everything else — all app code in `src/` — is authored directly as ES
modules with **no framework**. There was a React version of this app
before; it's gone, along with the JSX build step it required. See
"Rendering, without a framework" below for how the UI updates without one.

## Running it

Any static file server works — there's nothing to build first. From this
folder:

```bash
python -m http.server 8000
```

then open `http://localhost:8000/`. (Node's `npx serve` would also work,
but that pulls from npm, which defeats the point — Python ships with most
systems and involves no package manager at all. A code editor's built-in
"Live Server" style extension works too.)

A local server is **required** — opening `index.html` from the filesystem
does not work. Browsers refuse to load ES modules over `file://`, so
`main.js` never runs and the page stays blank.

**Deploying** is the same idea: copy this folder's contents to any static
host (GitHub Pages, S3, an internal file share behind a web server, ...).
There's no build artifact to produce — what's in `src/` and `index.html` is
what ships.

Every asset path is **relative**, so the site works both at a domain root
and in a subfolder — which is what GitHub Pages project sites use
(`bwize.github.io/EMKF_StabilityExplorer/`). Keep it that way: a leading
`/` in a `src`/`href` silently 404s on Pages and blanks the page. For the
one path resolved at runtime rather than by the browser's HTML parser, see
`KAUFFMAN_LOGO` in `src/components/header.js`. The empty `.nojekyll` file
tells Pages to publish the files as-is instead of running them through
Jekyll.

## Rendering, without a framework

`src/dom.js` exports a small `el(tag, props, ...children)` helper — a
stand-in for `React.createElement`, but with no virtual DOM: it builds real
DOM nodes immediately. `src/state.js` is a plain object plus a `setState()`
that re-runs a single `render()` callback. `src/main.js` wires the two
together: it builds the static `<calcite-shell>` layout once, then on every
`setState()` call, `render()` recomputes derived data (active fields, field
stats, the map renderer, ...) and replaces the DOM subtrees that depend on
it — the controls panel body and the tract detail panel — the same way the
old React version's component tree re-rendered on state changes, just
without a diffing algorithm underneath. The map itself
(`src/mapView.js`) is created exactly once and never torn down, matching
the mount-once `useEffect` the old `MapView.jsx` used.

## Project structure

```
index.html            # CDN script tags + import map, CSS links, mount point
src/
  main.js              # bootstraps the shell, owns state -> render wiring
  state.js              # plain state object + setState()/subscribe()
  dom.js                  # el() hyperscript helper (React.createElement stand-in)
  mapView.js                # owns the Map/MapView/FeatureLayer lifecycle + click handling
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
    indicatorPicker.js, legend.js, tractPanel.js, header.js, dataStatusNotice.js
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
