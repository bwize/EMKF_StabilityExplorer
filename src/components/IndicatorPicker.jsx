import { useEffect, useRef } from "react";
import { FIELD_META } from "../config/fieldMeta.js";
import { useCalciteEvent } from "../hooks/useCalciteEvent.js";

/**
 * Grouped dropdown of every indicator currently available on the live
 * layer. `groupedFields` is [[groupName, [fieldId, ...]], ...] from
 * lib/layerFields.js — already filtered to fields that actually exist.
 */
export default function IndicatorPicker({ groupedFields, value, onChange }) {
  const selectRef = useRef(null);

  useCalciteEvent(selectRef, "calciteSelectChange", (event) => {
    onChange(event.target.value);
  });

  // Force the DOM property directly rather than relying on JSX prop ->
  // attribute reflection, so the dropdown reliably tracks `value` even if a
  // future Calcite/React version changes how primitive props are applied to
  // custom elements.
  useEffect(() => {
    if (selectRef.current && value !== undefined) {
      selectRef.current.value = value;
    }
  }, [value]);

  return (
    <calcite-label layout="inline-space-between" class="indicator-picker">
      <span>Indicator</span>
      <calcite-select ref={selectRef} label="Choose an indicator to map" scale="m">
        {groupedFields.map(([group, ids]) => (
          <calcite-option-group key={group} label={group}>
            {ids.map((id) => (
              <calcite-option key={id} value={id} label={FIELD_META[id].label} />
            ))}
          </calcite-option-group>
        ))}
      </calcite-select>
    </calcite-label>
  );
}
