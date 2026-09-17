import { delegate, hideAll } from "tippy.js";

// ---------------------------------------------------------------------------
// App-wide tooltips (tippy.js), wired once by event delegation on <body>
// rather than per element: render() rebuilds the panels from scratch on every
// state change, so anything bound to individual nodes would have to be
// re-bound each time. Any element built with tipAttrs() just works, wherever
// and whenever it's mounted.
//
// Styled by the "stability" theme in App.css.
// ---------------------------------------------------------------------------

/**
 * Attributes that give an element a tooltip, for spreading into el() props.
 * Nothing is rendered when `body` is empty.
 *
 * @param {{ title?: string, body: string, note?: string|null,
 *           placement?: "top"|"right"|"bottom"|"left" }} tip
 *   title: bold first line; body: the explanation; note: a smaller, muted
 *   closing line for context specific to this element (e.g. a percentile).
 */
export function tipAttrs({ title, body, note, placement }) {
  if (!body) return {};
  return {
    "data-tip": body,
    "data-tip-title": title,
    "data-tip-note": note,
    // Read by tippy itself (data-tippy-* attributes override the defaults).
    "data-tippy-placement": placement,
  };
}

function tooltipContent(reference) {
  const content = document.createElement("div");
  const { tipTitle, tip, tipNote } = reference.dataset;
  for (const [className, text] of [
    ["tip-title", tipTitle],
    ["tip-body", tip],
    ["tip-note", tipNote],
  ]) {
    if (!text) continue;
    const line = document.createElement("div");
    line.className = className;
    line.textContent = text;
    content.append(line);
  }
  return content;
}

/** Call once at startup. */
export function initTooltips() {
  delegate(document.body, {
    target: "[data-tip]",
    content: tooltipContent,
    theme: "stability",
    placement: "top",
    maxWidth: 360,
    // A short show delay keeps tooltips from strobing as the pointer crosses
    // a list of rows on its way somewhere else.
    delay: [250, 0],
    // Hold-to-show on touch, so a tap still scrolls the panel.
    touch: ["hold", 400],
    appendTo: () => document.body,
  });
}

/**
 * Close any open tooltip immediately. render() calls this before remounting,
 * since a tooltip whose element was just replaced would otherwise stay stuck
 * on screen with nothing under the pointer to close it.
 */
export function hideTooltips() {
  hideAll({ duration: 0 });
}
