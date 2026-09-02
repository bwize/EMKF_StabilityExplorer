import { el } from "../dom.js";
import { APP_TITLE, APP_SUBTITLE } from "../config/appConfig.js";

// Resolved against this module's own URL rather than the page URL, so the
// logo loads no matter what path the site is served from — a GitHub Pages
// project subfolder (/EMKF_StabilityExplorer/) as much as a domain root.
// import.meta.url is native ES modules; no bundler needed.
const KAUFFMAN_LOGO = new URL("../assets/brand/EMKF_Stacked_RGB.png", import.meta.url).href;

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
