import ArcGISMap from "@arcgis/core/Map.js";
import EsriMapView from "@arcgis/core/views/MapView.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import GeoJSONLayer from "@arcgis/core/layers/GeoJSONLayer.js";
import Graphic from "@arcgis/core/Graphic.js";
// Both of these are deprecated in @arcgis/core 5.x in favor of the
// <arcgis-basemap-gallery> / <arcgis-expand> web components in the separate
// @arcgis/map-components package. They still ship working implementations, and
// using them keeps this file on one API and avoids pulling in that package for
// a single control — but that's the migration path when they're removed.
import BasemapGallery from "@arcgis/core/widgets/BasemapGallery.js";
import Expand from "@arcgis/core/widgets/Expand.js";

import { FEATURE_LAYER_URL, DEFAULT_BASEMAP } from "./config/appConfig.js";
import { BRAND } from "./config/brand.js";

// ZIP (ZCTA) boundaries for the region, trimmed and reprojected from
// src/zcta.json by prep_zcta.py, with ACS fields joined in by 01_acs_tracts.py.
// Resolved against this module's URL so it loads from any deploy path, same as
// the header logo.
const ZCTA_URL = new URL("./assets/zcta_kc.geojson", import.meta.url).href;

/**
 * A GeoJSON Polygon/MultiPolygon as an ArcGIS polygon. Every ring is reversed:
 * GeoJSON winds outer rings counter-clockwise, ArcGIS clockwise.
 */
function toEsriPolygon(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return {
    type: "polygon",
    rings: polygons.flatMap((rings) => rings.map((ring) => [...ring].reverse())),
    spatialReference: { wkid: 4326 },
  };
}

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
 *           onTractClick: (attributes: object|null) => void,
 *           onZipsReady?: (records: object[]) => void,
 *           showZips?: boolean }} handlers
 * @returns {{ setRenderer(renderer): void, clearHighlight(): void,
 *             setZipsVisible(visible: boolean): void, selectZip(zip: string|null): void }}
 */
export function initMapView(container, { onLayerReady, onTractClick, onZipsReady, showZips = true }) {
  let layerViewRef = null;
  let highlightHandle = null;
  // ZIP -> GeoJSON geometry, filled once the ZCTA file loads; selectZip() reads it.
  const zipGeometries = new Map();
  let selectedZip = null;
  let zipGraphic = null;

  const featureLayer = new FeatureLayer({
    url: FEATURE_LAYER_URL,
    outFields: ["*"],
    popupEnabled: false,
  });

  // Outline-only overlay drawn above the tracts: no fill, so the choropleth
  // reads through, and a darker, heavier line than the tract outlines so ZIP
  // edges stand out from tract edges. Labels only once zoomed in far enough
  // that ~200 of them don't pile up.
  const zipLayer = new GeoJSONLayer({
    url: ZCTA_URL,
    title: "ZIP codes",
    visible: showZips,
    popupEnabled: false,
    renderer: {
      type: "simple",
      symbol: {
        type: "simple-fill",
        color: [0, 0, 0, 0],
        outline: { color: [30, 30, 30, 0.85], width: 1.5 },
      },
    },
    labelingInfo: [
      {
        labelExpressionInfo: { expression: "$feature.ZIP" },
        labelPlacement: "always-horizontal",
        maxScale: 0,
        minScale: 250000,
        symbol: {
          type: "text",
          color: [30, 30, 30, 1],
          haloColor: [255, 255, 255, 0.9],
          haloSize: 1.5,
          font: { size: 10, weight: "bold" },
        },
      },
    ],
  });

  const map = new ArcGISMap({ basemap: DEFAULT_BASEMAP, layers: [featureLayer, zipLayer] });

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

  // The ZIP attributes (ACS fields) are read straight off the file rather than
  // queried from zipLayer: GeoJSONLayer infers field types from the features,
  // and a ZIP with no ACS rows (ZIP only) could skew that inference. Same URL
  // as the layer, so the browser serves the second request from cache.
  fetch(ZCTA_URL)
    .then((response) => response.json())
    .then((geojson) => {
      for (const feature of geojson.features) {
        zipGeometries.set(String(feature.properties.ZIP), feature.geometry);
      }
      onZipsReady?.(geojson.features.map((f) => f.properties));
    })
    .catch((error) => {
      console.error("Failed to load ZIP code data:", error);
    });

  view.on("click", async (event) => {
    // Only the tract layer is clickable; the ZIP overlay sits on top but
    // shouldn't swallow tract clicks.
    const hit = await view.hitTest(event, { include: [featureLayer] });
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
    /** Show or hide the ZIP code overlay. */
    setZipsVisible(visible) {
      zipLayer.visible = visible;
    },
    /**
     * Outline the selected ZIP and zoom to it, or clear the outline for null.
     * Drawn as a view graphic rather than a layer highlight so it shows even
     * with the ZIP overlay switched off, and above the tract fills without
     * touching their symbology. A no-op when the selection hasn't changed, so
     * render() can call it on every state change.
     */
    selectZip(zip) {
      if (zip === selectedZip) return;
      const geometry = zip ? zipGeometries.get(zip) : null;
      if (zip && !geometry) return; // ZIP data not loaded yet
      selectedZip = zip;

      if (zipGraphic) view.graphics.remove(zipGraphic);
      zipGraphic = null;
      if (!geometry) return;

      zipGraphic = new Graphic({
        geometry: toEsriPolygon(geometry),
        symbol: {
          type: "simple-fill",
          color: [0, 0, 0, 0],
          outline: { color: BRAND.orange, width: 3.5 },
        },
      });
      view.graphics.add(zipGraphic);
      view.goTo(zipGraphic.geometry.extent.clone().expand(1.4)).catch(() => {});
    },
    /** Clear the map highlight when the panel is closed without a new tract click. */
    clearHighlight() {
      highlightHandle?.remove();
      highlightHandle = null;
    },
  };
}
