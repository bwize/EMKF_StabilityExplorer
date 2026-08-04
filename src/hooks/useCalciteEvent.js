import { useEffect } from "react";

/**
 * Wire a Calcite web component's custom event to a React handler.
 *
 * Calcite's events (calciteSelectChange, calciteSwitchChange, ...) are plain
 * DOM CustomEvents, not part of React's synthetic event system, so a JSX
 * `onCalciteSelectChange={...}` prop silently does nothing — this is called
 * out explicitly in Esri's own React integration guide. `ref` must point at
 * the rendered calcite-* element.
 */
export function useCalciteEvent(ref, eventName, handler) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !handler) return undefined;
    el.addEventListener(eventName, handler);
    return () => el.removeEventListener(eventName, handler);
  }, [ref, eventName, handler]);
}
