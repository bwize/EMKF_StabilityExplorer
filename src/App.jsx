import { useEffect, useMemo, useState } from "react";

import Header from "./components/Header.jsx";
import MapView from "./components/MapView.jsx";
import IndicatorPicker from "./components/IndicatorPicker.jsx";
import Legend from "./components/Legend.jsx";
import TractPanel from "./components/TractPanel.jsx";
import DataStatusNotice from "./components/DataStatusNotice.jsx";

import { FIELD_META } from "./config/fieldMeta.js";
import { GEOID_FIELD, EXCLUDE_FIELD_CANDIDATES } from "./config/appConfig.js";
import { getActiveFieldIds, groupActiveFields, findField } from "./lib/layerFields.js";
import { computeAllFieldStats } from "./lib/stats.js";
import { buildClassBreaksRenderer } from "./lib/classify.js";

import "./App.css";

const TOTAL_TRACKED_FIELDS = Object.keys(FIELD_META).length;

function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export default function App() {
  const [layerFieldNames, setLayerFieldNames] = useState(null);
  const [records, setRecords] = useState(null);
  const [excludeFieldName, setExcludeFieldName] = useState(null);
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [selectedTract, setSelectedTract] = useState(null);
  const [darkMode, setDarkMode] = useState(prefersDark);

  useEffect(() => {
    document.documentElement.classList.toggle("calcite-mode-dark", darkMode);
  }, [darkMode]);

  const activeFieldIds = useMemo(
    () => (layerFieldNames ? getActiveFieldIds(layerFieldNames) : []),
    [layerFieldNames],
  );
  const groupedFields = useMemo(() => groupActiveFields(activeFieldIds), [activeFieldIds]);
  const fieldStats = useMemo(
    () => (records ? computeAllFieldStats(records, activeFieldIds, excludeFieldName) : new Map()),
    [records, activeFieldIds, excludeFieldName],
  );

  const currentMeta = activeFieldId ? FIELD_META[activeFieldId] : null;
  const currentStats = activeFieldId ? fieldStats.get(activeFieldId) : null;

  const rendererInfo = useMemo(() => {
    if (!activeFieldId || !currentMeta || !currentStats || currentStats.sorted.length === 0) {
      return null;
    }
    return buildClassBreaksRenderer({
      field: activeFieldId,
      values: currentStats.sorted,
      direction: currentMeta.direction,
      excludeFieldName,
    });
  }, [activeFieldId, currentMeta, currentStats, excludeFieldName]);

  function handleLayerReady({ fieldNames, records: loadedRecords }) {
    setLayerFieldNames(fieldNames);
    setRecords(loadedRecords);
    setExcludeFieldName(findField(fieldNames, EXCLUDE_FIELD_CANDIDATES));
    const active = getActiveFieldIds(fieldNames);
    setActiveFieldId(active[0] ?? null);
  }

  const isLoading = layerFieldNames === null;

  return (
    <calcite-shell>
      <Header darkMode={darkMode} onToggleDarkMode={setDarkMode} />

      <calcite-shell-panel slot="panel-start" position="start" widthScale="m" displayMode="dock">
        <calcite-panel heading="Map controls">
          {isLoading ? (
            <calcite-loader label="Loading tracts" text="Loading tracts…" />
          ) : (
            <div className="controls-body">
              <DataStatusNotice activeCount={activeFieldIds.length} totalCount={TOTAL_TRACKED_FIELDS} />
              {activeFieldId && (
                <IndicatorPicker
                  groupedFields={groupedFields}
                  value={activeFieldId}
                  onChange={setActiveFieldId}
                />
              )}
              {currentMeta && <p className="indicator-description">{currentMeta.description}</p>}
              <Legend breaks={rendererInfo?.breaks} direction={currentMeta?.direction} />
            </div>
          )}
        </calcite-panel>
      </calcite-shell-panel>

      <MapView
        renderer={rendererInfo?.renderer}
        selectedGeoid={selectedTract?.[GEOID_FIELD] ?? null}
        onLayerReady={handleLayerReady}
        onTractClick={setSelectedTract}
      />

      <calcite-shell-panel slot="panel-end" position="end" widthScale="m" displayMode="dock">
        <TractPanel
          tract={selectedTract}
          groupedFields={groupedFields}
          fieldStats={fieldStats}
          excludeFieldName={excludeFieldName}
          onClose={() => setSelectedTract(null)}
        />
      </calcite-shell-panel>
    </calcite-shell>
  );
}
