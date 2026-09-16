import { el } from "../dom.js";
import { APP_TITLE } from "../config/appConfig.js";

/**
 * Welcome dialog shown once on page load, over the map. Self-contained: it
 * closes itself and never touches app state, so main.js just mounts it and
 * forgets about it. Dismissing it (button, close icon, Esc, or clicking the
 * scrim) removes the node entirely.
 *
 * TODO: placeholder copy — replace with real welcome text.
 */
export function SplashScreen() {
  const dialog = el(
    "calcite-dialog",
    {
      open: true,
      modal: true,
      heading: `Welcome to ${APP_TITLE}`,
      widthScale: "s",
      class: "splash-screen",
      onCalciteDialogClose: () => dialog.remove(),
    },
    el(
      "div",
      { class: "splash-body" },
      el(
        "p",
        null,
        "Some explanatory text about the 6 county region and how to use the tool.",
      ),
      el(
        "p",
        null,
        "More text.",
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
