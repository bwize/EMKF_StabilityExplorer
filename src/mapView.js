import ArcGISMap from "@arcgis/core/Map.js";
import EsriMapView from "@arcgis/core/views/MapView.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import Graphic from "@arcgis/core/Graphic.js";
// Both of these are deprecated in @arcgis/core 5.x in favor of the
// <arcgis-basemap-gallery> / <arcgis-expand> web components in the separate
// @arcgis/map-components package. They still ship working implementations, and
// using them keeps this file on one API and avoids pulling in that package for
// a single control — but that's the migration path when they're removed.
import BasemapGallery from "@arcgis/core/widgets/BasemapGallery.js";
import Expand from "@arcgis/core/widgets/Expand.js";

import {
  FEATURE_LAYER_URL,
  ZIP_LAYER_URL,
  ZIP_FIELD,
  HIDDEN_ZIPS,
  DEFAULT_BASEMAP,
} from "./config/appConfig.js";
import { BRAND } from "./config/brand.js";

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
  const zipLayer = new FeatureLayer({
    url: ZIP_LAYER_URL,
    outFields: [ZIP_FIELD],
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
        labelExpressionInfo: { expression: `$feature.${ZIP_FIELD}` },
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

  // A ZIP as a SQL literal for zipLayer's ZIP field, which may have been
  // published as text or as a number. Only valid once the layer has loaded.
  const zipLiteral = (zip) => {
    const field = zipLayer.fields.find((f) => f.name === ZIP_FIELD);
    return field?.type === "string" ? `'${zip.replace(/'/g, "''")}'` : String(Number(zip));
  };

  // Resolves once HIDDEN_ZIPS is filtered out at the layer, so the outlines,
  // the attribute query, and selectZip() all see the same set of ZIPs. Every
  // use of zipLayer below waits on this rather than on zipLayer.load().
  const zipLayerReady = zipLayer.load().then(() => {
    if (HIDDEN_ZIPS.length) {
      zipLayer.definitionExpression = `${ZIP_FIELD} NOT IN (${HIDDEN_ZIPS.map(zipLiteral).join(", ")})`;
    }
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

  // ZIP attributes (the same ACS fields as the tracts), without geometry;
  // selectZip() fetches the one outline it needs on demand.
  zipLayerReady
    .then(() =>
      zipLayer.queryFeatures({
        where: "1=1",
        outFields: ["*"],
        returnGeometry: false,
      }),
    )
    .then((result) => {
      // Filtered again here, by plain string comparison, in case the server
      // compared the layer filter differently (a number field, stray spaces).
      const hidden = new Set(HIDDEN_ZIPS);
      const records = result.features
        .map((f) => f.attributes)
        .filter((r) => !hidden.has(String(r[ZIP_FIELD] ?? "").trim()));
      const leaked = result.features.length - records.length;
      if (leaked > 0) {
        console.warn(`${leaked} hidden ZIP(s) got past the layer filter:`, zipLayer.definitionExpression);
      }
      onZipsReady?.(records);
    })
    .catch((error) => {
      console.error("Failed to load the ZIP code layer:", error);
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
      selectedZip = zip;

      if (zipGraphic) view.graphics.remove(zipGraphic);
      zipGraphic = null;
      if (!zip) return;

      zipLayerReady
        .then(() => {
          return zipLayer.queryFeatures({
            where: `${ZIP_FIELD} = ${zipLiteral(zip)}`,
            returnGeometry: true,
            outSpatialReference: view.spatialReference,
          });
        })
        .then((result) => {
          const geometry = result.features[0]?.geometry;
          // Skip if the selection moved on while the query was in flight.
          if (!geometry || zip !== selectedZip) return;
          zipGraphic = new Graphic({
            geometry,
            symbol: {
              type: "simple-fill",
              color: [0, 0, 0, 0],
              outline: { color: BRAND.orange, width: 3.5 },
            },
          });
          view.graphics.add(zipGraphic);
          view.goTo(geometry.extent.clone().expand(1.4)).catch(() => {});
        })
        .catch((error) => {
          console.error(`Failed to load the outline for ZIP ${zip}:`, error);
        });
    },
    /** Clear the map highlight when the panel is closed without a new tract click. */
    clearHighlight() {
      highlightHandle?.remove();
      highlightHandle = null;
    },
  };
}
