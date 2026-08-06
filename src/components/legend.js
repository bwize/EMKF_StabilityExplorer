import { el } from "../dom.js";

/** Reads directly off the same {min,max,color,label} breaks used to build the map renderer, so the legend can never drift out of sync with what's on the map. */
export function Legend({ breaks, direction }) {
  if (!breaks || breaks.length === 0) return null;

  const hint =
    direction === "high"
      ? "Darker = higher value = more vulnerable"
      : direction === "low"
        ? "Darker = lower value = more vulnerable"
        : "Darker = higher value (no vulnerability judgment)";

  return el(
    "div",
    { class: "legend" },
    breaks.map((b) =>
      el(
        "div",
        { class: "legend-row" },
        el("span", { class: "legend-swatch", style: { backgroundColor: b.color } }),
        el("span", { class: "legend-label" }, b.label),
      ),
    ),
    el("p", { class: "legend-hint" }, hint),
  );
}
