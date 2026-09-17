import { el } from "../dom.js";
import { APP_TITLE } from "../config/appConfig.js";

/**
 * Welcome dialog shown once on page load, over the map. Self-contained: it
 * closes itself and never touches app state, so main.js just mounts it and
 * forgets about it. Dismissing it (button, close icon, Esc, or clicking the
 * scrim) removes the node entirely.
 *
 * The region, the 10% flag threshold, and the small-sample screen described
 * here mirror COUNTIES_BY_FIPS / FLAG_QUANTILE (appConfig.js) and SCREEN in
 * 01_acs_tracts.py - update this copy if any of those change.
 */
export function SplashScreen() {
  const dialog = el(
    "calcite-dialog",
    {
      open: true,
      modal: true,
      heading: `Welcome to ${APP_TITLE}`,
      description: "Housing, economic, and mobility indicators for the Kansas City region",
      widthScale: "m",
      class: "splash-screen",
      onCalciteDialogClose: () => dialog.remove(),
    },
    el(
      "div",
      { class: "splash-body" },
      el(
        "p",
        null,
        "This map brings together neighborhood-level indicators of household stability - " +
          "housing costs, employment, income supports, residential churn, education and access, " +
          "and age - for every census tract and ZIP code in a six-county Kansas City region:",
      ),
      el(
        "ul",
        null,
        el("li", null, el("strong", null, "Missouri: "), "Cass, Clay, Jackson, and Platte counties"),
        el("li", null, el("strong", null, "Kansas: "), "Johnson and Wyandotte counties"),
      ),
      el(
        "p",
        null,
        "Every comparison in the tool is made against this region. A tract's percentile tells you " +
          "how it ranks among all tracts in the six counties, and an indicator is flagged when " +
          "the tract falls in the region's worst-off 10% on it. ZIP codes are ranked only against " +
          "other ZIP codes in the region.",
      ),
      el("h3", { class: "splash-subhead" }, "Getting started"),
      el(
        "ul",
        null,
        el(
          "li",
          null,
          "The map opens on the ",
          el("strong", null, "Mobility Category"),
          ", a composite summary of each tract. Use the panel on the left to map any single indicator instead.",
        ),
        el("li", null, "Click a tract to see all of its indicators, with flags and percentiles, in the panel on the right."),
        el("li", null, "Search for a ZIP code to see the same figures for that ZIP and outline it on the map."),
      ),
      el(
        "p",
        { class: "splash-note" },
        "Figures are from the American Community Survey 2020–2024 5-year estimates. Tracts with " +
          "fewer than 50 residents or households, or more than 40% of residents in group quarters " +
          "(dorms, nursing homes, prisons), are excluded from rankings because their estimates are too unstable.",
      ),
    ),
    el(
      "calcite-button",
      { slot: "footer-end", onClick: () => (dialog.open = false) },
      "Get started",
    ),
  );
  return dialog;
}
