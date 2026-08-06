import { el } from "../dom.js";
import { APP_TITLE, APP_SUBTITLE } from "../config/appConfig.js";

// Absolute path from the site root — img.src resolves relative to the page
// URL, not this module's location, so this can't be a relative "../..."
// path the way a bundler-processed import could be.
const KAUFFMAN_LOGO = "/src/assets/brand/EMKF_Stacked_RGB.png";

/**
 * @param {{ darkMode: boolean, onToggleDarkMode: (checked: boolean) => void }} props
 */
export function Header({ darkMode, onToggleDarkMode }) {
  return el(
    "calcite-navigation",
    { slot: "header" },
    el(
      "div",
      { slot: "logo", class: "brand-lockup" },
      el("img", { src: KAUFFMAN_LOGO, alt: "Ewing Marion Kauffman Foundation", class: "brand-logo" }),
      el("div", { class: "brand-divider", "aria-hidden": "true" }),
      el("calcite-navigation-logo", { heading: APP_TITLE, description: APP_SUBTITLE }),
    ),
    el(
      "calcite-label",
      { layout: "inline", class: "dark-mode-toggle", slot: "content-end" },
      el("span", null, "Dark"),
      el("calcite-switch", {
        scale: "s",
        checked: darkMode,
        onCalciteSwitchChange: (event) => onToggleDarkMode(event.target.checked),
      }),
    ),
  );
}
