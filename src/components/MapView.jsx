import { useEffect, useRef } from "react";

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

import { FEATURE_LAYER_URL, DEFAULT_BASEMAP } from "../config/appConfig.js";

/**
 * Owns the ArcGIS Map/MapView/FeatureLayer lifecycle. Renders nothing but a
 * full-size div — all indicator selection, classification, and the tract
 * detail panel live in App.jsx / sibling components, which only ever see
 * plain data (field names, attribute records, a ready-made renderer).
 */
export default function MapView({ renderer, selectedGeoid, onLayerReady, onTractClick }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const layerRef = useRef(null);
  const layerViewRef = useRef(null);
  const highlightRef = useRef(null);

  // Latest callback refs so the mount effect (which must stay [] to avoid
  // tearing down the map on every render) always calls the current handler.
  const onLayerReadyRef = useRef(onLayerReady);
  const onTractClickRef = useRef(onTractClick);
  onLayerReadyRef.current = onLayerReady;
  onTractClickRef.current = onTractClick;

  // Mount once: create the map, view, and layer; run the one bulk query used
  // for statistics/classification; wire up click -> hitTest -> selection.
  useEffect(() => {
    let cancelled = false;

    const featureLayer = new FeatureLayer({
      url: FEATURE_LAYER_URL,
      outFields: ["*"],
      popupEnabled: false,
    });
    layerRef.current = featureLayer;

    const map = new Map({ basemap: DEFAULT_BASEMAP, layers: [featureLayer] });

    const view = new EsriMapView({
      container: containerRef.current,
      map,
      constraints: { snapToZoom: false, minZoom: 8 },
    });
    viewRef.current = view;

    // Basemap picker, collapsed to a single button so it doesn't cover the map
    // until asked for. Top-right keeps it clear of the default zoom controls.
    // Both widgets are torn down by view.destroy() below, which disposes the
    // widgets registered in view.ui.
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
      if (cancelled) return;
      featureLayer
        .when(() => view.goTo(featureLayer.fullExtent).catch(() => {}))
        .catch(() => {});

      view.whenLayerView(featureLayer).then((layerView) => {
        if (!cancelled) layerViewRef.current = layerView;
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
        if (cancelled) return;
        const fieldNames = featureLayer.fields.map((f) => f.name);
        const records = result.features.map((f) => f.attributes);
        onLayerReadyRef.current?.({ fieldNames, records });
      })
      .catch((error) => {
        if (!cancelled) console.error("Failed to load the tract layer:", error);
      });

    const clickHandle = view.on("click", async (event) => {
      const hit = await view.hitTest(event);
      const result = hit.results.find(
        (r) => r.type === "graphic" && r.graphic.layer === featureLayer,
      );

      highlightRef.current?.remove();
      highlightRef.current = null;

      if (!result) {
        onTractClickRef.current?.(null);
        return;
      }

      if (layerViewRef.current) {
        highlightRef.current = layerViewRef.current.highlight(result.graphic);
      }
      onTractClickRef.current?.(result.graphic.attributes);
    });

    return () => {
      cancelled = true;
      clickHandle.remove();
      highlightRef.current?.remove();
      view.destroy();
      viewRef.current = null;
      layerRef.current = null;
      layerViewRef.current = null;
    };
  }, []);

  // Apply whatever renderer the parent has computed for the active field.
  useEffect(() => {
    if (layerRef.current && renderer) {
      layerRef.current.renderer = renderer;
    }
  }, [renderer]);

  // Clear the map highlight when the panel is closed (selectedGeoid -> null)
  // without a new tract having been clicked.
  useEffect(() => {
    if (!selectedGeoid && highlightRef.current) {
      highlightRef.current.remove();
      highlightRef.current = null;
    }
  }, [selectedGeoid]);

  return <div ref={containerRef} className="map-view" />;
}
