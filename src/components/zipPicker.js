import { el } from "../dom.js";

/**
 * Searchable ZIP code selector. A combobox rather than a calcite-select: ~200
 * ZIPs is too long a list to scroll, and typing the first digits narrows it.
 *
 * Selecting a ZIP shows its figures in the detail panel and outlines it on the
 * map; the tract choropleth underneath is left alone, so the tracts inside the
 * ZIP can be compared against it. Clearing the box clears the selection.
 *
 * @param {{ zips: string[], value: string|null, onChange: (zip: string|null) => void }} props
 */
export function ZipPicker({ zips, value, onChange }) {
  return el(
    "calcite-label",
    { layout: "default", class: "zip-picker" },
    el("span", null, "ZIP code"),
    el(
      "calcite-combobox",
      {
        label: "Choose a ZIP code",
        placeholder: "Search ZIP codes",
        selectionMode: "single",
        scale: "m",
        onCalciteComboboxChange: (event) => {
          const [item] = event.target.selectedItems ?? [];
          onChange(item ? item.value : null);
        },
      },
      zips.map((zip) =>
        el("calcite-combobox-item", { value: zip, heading: zip, selected: zip === value }),
      ),
    ),
  );
}
