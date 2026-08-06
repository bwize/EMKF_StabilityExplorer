import Map from "@arcgis/core/Map.js";
import EsriMapView from "@arcgis/core/views/MapView.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
// Both of these are deprecated in @arcgis/core 5.x in favor of the
// <arcgis-basemap-gallery> / <arcgis-expand> web components in the separate
// @arcgis/map-components package. They still ship working implementations, and
// using them keeps this file on one API and avoids pulling in that package for
// a single control — but that's the migration path when they're removed.
import BasemapGallery from "@arcgis/core/widgets/BasemapGallery.js";
import Expand from "@arcgis/core/widgets/Expand.js";

import { FEATURE_LAYER_URL, DEFAULT_BASEMAP } from "./config/appConfig.js";

/**
 * Owns the ArcGIS Map/MapView/FeatureLayer lifecycle. Ported from the old
 * MapView.jsx's mount-once effect: call this exactly once with a container
 * div, and it never tears down or re-creates the map for the lifetime of the
 * page (there's no framework re-render to guard against here, so the
 * `cancelled` flag / dependency array of the original just becomes a plain
 * function body).
 *
 * @param {HTMLElement} container
 * @param {{ onLayerReady: (info: {fieldNames: string[], records: object[]}) => void,
 *           onTractClick: (attributes: object|null) => void }} handlers
 * @returns {{ setRenderer(renderer): void, clearHighlight(): void }}
 */
export function initMapView(container, { onLayerReady, onTractClick }) {
  let layerViewRef = null;
  let highlightHandle = null;

  const featureLayer = new FeatureLayer({
    url: FEATURE_LAYER_URL,
    outFields: ["*"],
    popupEnabled: false,
  });

  const map = new Map({ basemap: DEFAULT_BASEMAP, layers: [featureLayer] });

  const view = new EsriMapView({
    container,
    map,
    constraints: { snapToZoom: false, minZoom: 8 },
  });

  // Basemap picker, collapsed to a single button so it doesn't cover the map
  // until asked for. Top-right keeps it clear of the default zoom controls.
  view.ui.add(
    new Expand({
      view,
      content: new BasemapGallery({ view }),
      expandIcon: "basemap",
      expandTooltip: "Change basemap",
    }),
    "top-right",
  );

  view.when(() => {
    featureLayer
      .when(() => view.goTo(featureLayer.fullExtent).catch(() => {}))
      .catch(() => {});

    view.whenLayerView(featureLayer).then((layerView) => {
      layerViewRef = layerView;
    });
  });

  featureLayer
    .load()
    .then(() =>
      featureLayer.queryFeatures({
        where: "1=1",
        outFields: ["*"],
        returnGeometry: false,
      }),
    )
    .then((result) => {
      const fieldNames = featureLayer.fields.map((f) => f.name);
      const records = result.features.map((f) => f.attributes);
      onLayerReady?.({ fieldNames, records });
    })
    .catch((error) => {
      console.error("Failed to load the tract layer:", error);
    });

  view.on("click", async (event) => {
    const hit = await view.hitTest(event);
    const result = hit.results.find(
      (r) => r.type === "graphic" && r.graphic.layer === featureLayer,
    );

    highlightHandle?.remove();
    highlightHandle = null;

    if (!result) {
      onTractClick?.(null);
      return;
    }

    if (layerViewRef) {
      highlightHandle = layerViewRef.highlight(result.graphic);
    }
    onTractClick?.(result.graphic.attributes);
  });

  return {
    /** Apply whatever renderer the caller has computed for the active field. */
    setRenderer(renderer) {
      if (renderer) featureLayer.renderer = renderer;
    },
    /** Clear the map highlight when the panel is closed without a new tract click. */
    clearHighlight() {
      highlightHandle?.remove();
      highlightHandle = null;
    },
  };
}
