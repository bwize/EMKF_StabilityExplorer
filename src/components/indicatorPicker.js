import { el } from "../dom.js";
import { FIELD_META } from "../config/fieldMeta.js";

/**
 * Grouped dropdown of every indicator currently available on the live
 * layer. `groupedFields` is [[groupName, [fieldId, ...]], ...] from
 * lib/layerFields.js — already filtered to fields that actually exist.
 */
export function IndicatorPicker({ groupedFields, value, onChange }) {
  const select = el(
    "calcite-select",
    {
      label: "Choose an indicator to map",
      // Scale "l" rather than "m": this is the control the whole map hangs
      // off, and the indicator names it holds are long enough to want the
      // extra type size. Kept in sync with the calcite-label below, which
      // sizes the "Indicator" caption from its own scale.
      scale: "l",
      onCalciteSelectChange: (event) => onChange(event.target.value),
    },
    groupedFields.map(([group, ids]) =>
      el(
        "calcite-option-group",
        { label: group },
        ids.map((id) => el("calcite-option", { value: id, label: FIELD_META[id].label })),
      ),
    ),
  );

  // Set the DOM property directly, after the <calcite-option> children exist,
  // rather than as a constructor prop — a <calcite-select> can't select a
  // value for an option it hasn't upgraded yet. Same ordering fix the old
  // React version needed (its useEffect ran after the JSX children mounted).
  if (value !== undefined) select.value = value;

  // Stacked rather than inline-space-between: the indicator names run long
  // ("Share of All Households Low-Income & Burdened"), and sharing the row
  // with the caption left the select too narrow to show most of them without
  // truncating. Stacking spends vertical space the panel has to spare.
  return el(
    "calcite-label",
    { layout: "default", scale: "l", class: "indicator-picker" },
    el("span", null, "Indicator"),
    select,
  );
}
