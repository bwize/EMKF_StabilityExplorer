import { el } from "../dom.js";

/**
 * Reads directly off the same {color, label} breaks used to build the map
 * renderer, so the legend can never drift out of sync with what's on the map.
 * Serves both renderers: the numeric class breaks from
 * buildClassBreaksRenderer, and the categorical entries from
 * buildMobilityRenderer — which additionally mark one entry `hatched`, drawn
 * here as a CSS crosshatch to match the map's diagonal-cross fill.
 *
 * `hint` overrides the direction-derived caption; the categorical map has no
 * "darker = higher value" reading to describe.
 */
export function Legend({ breaks, direction, hint }) {
  if (!breaks || breaks.length === 0) return null;

  const caption =
    hint ??
    (direction === "high"
      ? "Darker = higher value = more vulnerable"
      : direction === "low"
        ? "Darker = lower value = more vulnerable"
        : "Darker = higher value (no vulnerability judgment)");

  return el(
    "div",
    { class: "legend" },
    breaks.map((b) =>
      el(
        "div",
        { class: "legend-row" },
        el("span", {
          class: `legend-swatch${b.hatched ? " is-hatched" : ""}`,
          // A hatched swatch draws its pattern from CSS; giving it a
          // backgroundColor too would fill in the gaps the hatch reads through.
          style: b.hatched || !b.color ? null : { backgroundColor: b.color },
        }),
        el("span", { class: "legend-label" }, b.label),
      ),
    ),
    el("p", { class: "legend-hint" }, caption),
  );
}
