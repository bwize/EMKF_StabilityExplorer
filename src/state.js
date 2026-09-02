// ---------------------------------------------------------------------------
// Plain state store, replacing the useState calls in the old App.jsx.
// setState() shallow-merges the patch and re-runs whatever render callback
// main.js has registered — there's no dependency tracking, so main.js's
// render() simply recomputes everything derived from state on every call
// (cheap at this app's scale; see lib/stats.js callers).
// ---------------------------------------------------------------------------

function prefersDark() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export const state = {
  layerFieldNames: null,
  records: null,
  excludeFieldName: null,
  mobilityFieldName: null,
  activeFieldId: null,
  selectedTract: null,
  darkMode: prefersDark(),
};

let onChange = null;

/** Register the single render callback to run after every setState(). */
export function subscribe(callback) {
  onChange = callback;
}

export function setState(patch) {
  Object.assign(state, patch);
  onChange?.();
}
