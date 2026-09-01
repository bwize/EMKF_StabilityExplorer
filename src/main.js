import { el, mount } from "./dom.js";
import { state, setState, subscribe } from "./state.js";
import { initMapView } from "./mapView.js";

import { Header } from "./components/header.js";
import { IndicatorPicker } from "./components/indicatorPicker.js";
import { Legend } from "./components/legend.js";
import { TractPanel } from "./components/tractPanel.js";
import { DataStatusNotice } from "./components/dataStatusNotice.js";

import { FIELD_META } from "./config/fieldMeta.js";
import { EXCLUDE_FIELD_CANDIDATES } from "./config/appConfig.js";
import { getActiveFieldIds, groupActiveFields, findField } from "./lib/layerFields.js";
import { computeAllFieldStats } from "./lib/stats.js";
import { buildClassBreaksRenderer } from "./lib/classify.js";

const TOTAL_TRACKED_FIELDS = Object.keys(FIELD_META).length;

// --- Static shell, built once ----------------------------------------------
// Everything below is mounted exactly once. Re-renders (see render() at the
// bottom) only ever replace the *children* of controlsBody / tractPanelSlot —
// never these nodes themselves, and never mapContainer, which the ArcGIS
// MapView below takes over for the life of the page. calcite-shell slots
// (header / panel-start / panel-end) only recognize slot="..." on their
// direct children, so those attributes stay on these top-level nodes rather
// than on anything nested inside them.

const headerNode = Header({
  darkMode: state.darkMode,
  onToggleDarkMode: (checked) => setState({ darkMode: checked }),
});
const darkModeSwitch = headerNode.querySelector("calcite-switch");

const controlsBody = el("calcite-panel", { heading: "Map controls" });
const mapContainer = el("div", { class: "map-view" });
// The tract panel is rebuilt wholesale on every render (its heading changes
// with the selection), so the stable node re-renders mount into is the
// shell-panel itself — not a wrapper div inside it. calcite-shell-panel gives
// its slotted content a definite height and clips the overflow; an extra
// auto-height div in between would leave .tract-panel's height: 100% resolving
// against nothing, and a long indicator list would be cut off with no scrollbar.
const tractPanelSlot = el("calcite-shell-panel", {
  slot: "panel-end",
  position: "end",
  widthScale: "m",
  displayMode: "dock",
});

mount(
  document.getElementById("root"),
  el(
    "calcite-shell",
    null,
    headerNode,
    el(
      "calcite-shell-panel",
      { slot: "panel-start", position: "start", widthScale: "m", displayMode: "dock" },
      controlsBody,
    ),
    mapContainer,
    tractPanelSlot,
  ),
);

const map = initMapView(mapContainer, {
  onLayerReady: ({ fieldNames, records }) => {
    const active = getActiveFieldIds(fieldNames);
    setState({
      layerFieldNames: fieldNames,
      records,
      excludeFieldName: findField(fieldNames, EXCLUDE_FIELD_CANDIDATES),
      activeFieldId: active[0] ?? null,
    });
  },
  onTractClick: (attributes) => setState({ selectedTract: attributes }),
});

subscribe(render);
render();

// --- Render: recompute derived data, rebuild only what changed -------------
// Replaces the useMemo/useEffect graph in the old App.jsx. There's no
// dependency tracking, so this just recomputes everything on every
// setState() — cheap at this app's scale (a few hundred tract records, a
// couple dozen indicators).
function render() {
  document.documentElement.classList.toggle("calcite-mode-dark", state.darkMode);
  darkModeSwitch.checked = state.darkMode;

  const isLoading = state.layerFieldNames === null;
  const activeFieldIds = state.layerFieldNames ? getActiveFieldIds(state.layerFieldNames) : [];
  const groupedFields = groupActiveFields(activeFieldIds);
  const fieldStats = state.records
    ? computeAllFieldStats(state.records, activeFieldIds, state.excludeFieldName)
    : new Map();

  const currentMeta = state.activeFieldId ? FIELD_META[state.activeFieldId] : null;
  const currentStats = state.activeFieldId ? fieldStats.get(state.activeFieldId) : null;

  const rendererInfo =
    state.activeFieldId && currentMeta && currentStats && currentStats.sorted.length > 0
      ? buildClassBreaksRenderer({
          field: state.activeFieldId,
          values: currentStats.sorted,
          direction: currentMeta.direction,
          excludeFieldName: state.excludeFieldName,
        })
      : null;

  map.setRenderer(rendererInfo?.renderer);
  // Clear the map highlight when the panel is closed (selectedTract -> null)
  // without a new tract having been clicked — a no-op if there's nothing to
  // clear (e.g. right after a fresh click already set it).
  if (!state.selectedTract) map.clearHighlight();

  mount(
    controlsBody,
    isLoading
      ? el("calcite-loader", { label: "Loading tracts", text: "Loading tracts…" })
      : el(
          "div",
          { class: "controls-body" },
          DataStatusNotice({ activeCount: activeFieldIds.length, totalCount: TOTAL_TRACKED_FIELDS }),
          state.activeFieldId &&
            IndicatorPicker({
              groupedFields,
              value: state.activeFieldId,
              onChange: (id) => setState({ activeFieldId: id }),
            }),
          currentMeta && el("p", { class: "indicator-description" }, currentMeta.description),
          Legend({ breaks: rendererInfo?.breaks, direction: currentMeta?.direction }),
        ),
  );

  mount(
    tractPanelSlot,
    TractPanel({
      tract: state.selectedTract,
      groupedFields,
      fieldStats,
      excludeFieldName: state.excludeFieldName,
      onClose: () => setState({ selectedTract: null }),
    }),
  );
}
