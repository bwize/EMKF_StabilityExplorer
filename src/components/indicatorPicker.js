import { el } from "../dom.js";

/**
 * Grouped dropdown of every indicator currently available on the live layer.
 *
 * `groups` is [[groupName, [{id, label}, ...]], ...], assembled in main.js —
 * already filtered to fields that actually exist, and carrying its own labels
 * rather than looking them up in FIELD_META, because the Mobility Category
 * entry at the top of the list isn't a FIELD_META rate indicator (see
 * config/mobilityCategory.js).
 */
export function IndicatorPicker({ groups, value, onChange }) {
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
    groups.map(([group, items]) =>
      el(
        "calcite-option-group",
        { label: group },
        items.map(({ id, label }) => el("calcite-option", { value: id, label })),
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
