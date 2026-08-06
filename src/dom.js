// ---------------------------------------------------------------------------
// Minimal hyperscript-style helper, standing in for React.createElement now
// that there's no build step to compile JSX. Unlike React there is no
// virtual DOM: el() creates real DOM nodes immediately, and callers rebuild
// (rather than diff) whatever subtree changed. That's the right trade at
// this app's scale — a few hundred rows at most, already fully re-rendered
// by React on every dropdown change today.
// ---------------------------------------------------------------------------

/**
 * @param {string} tag         element tag name, including calcite-* custom elements
 * @param {object|null} props  attributes/properties/listeners; `class` for className,
 *                              `style` as an object, `on<Event>` (e.g. `onClick`,
 *                              `onCalciteSelectChange`) for addEventListener — this is
 *                              how Calcite's custom DOM events get wired now that
 *                              hooks/useCalciteEvent.js no longer exists.
 * @param {...*} children      strings/numbers (-> text nodes), Nodes, arrays (flattened),
 *                              and null/undefined/false (skipped, so `cond && el(...)` works)
 */
export function el(tag, props, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;

    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key[2].toLowerCase() + key.slice(3), value);
    } else if (key === "class" || key === "className") {
      node.className = value;
    } else if (key === "style" && typeof value === "object") {
      Object.assign(node.style, value);
    } else if (key === "ref" && typeof value === "function") {
      value(node);
    } else if (key in node) {
      // Reflect as a DOM property when one exists (covers both plain
      // attributes like `href` and Calcite's element properties like
      // `<calcite-select>.value`, which must be set as a property to
      // reliably stick — see the note this replaces in IndicatorPicker).
      node[key] = value;
    } else {
      node.setAttribute(key, value);
    }
  }

  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) {
      appendChildren(node, child);
    } else if (child instanceof Node) {
      node.append(child);
    } else {
      node.append(document.createTextNode(String(child)));
    }
  }
}

/** Replace all of `container`'s children with `children` in one go. */
export function mount(container, ...children) {
  container.replaceChildren();
  appendChildren(container, children);
}
