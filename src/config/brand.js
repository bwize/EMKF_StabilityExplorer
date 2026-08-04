// ---------------------------------------------------------------------------
// Ewing Marion Kauffman Foundation brand palette, transcribed from
// "Brand Guidelines_042425.pdf". Hex values are the PDF's own hex swatches
// (not re-derived from the CMYK/PMS breakdowns, which round slightly
// differently).
//
// These are exported as plain values for use in JS (e.g. map/chart colors
// that need a real color, not a CSS variable). The same values are also
// wired into Calcite's theme via CSS custom properties in index.css — that's
// what actually themes buttons, switches, focus rings, etc. Change both
// places together if the palette ever changes.
//
// Only chrome/identity gets branded — the choropleth/flagging colors in
// lib/colorRamps.js stay a semantic red/blue regardless of brand, the same
// way you wouldn't reskin a weather map's temperature scale to match a logo.
// ---------------------------------------------------------------------------

export const BRAND = {
  // Primary blue. PMS 279 (#3E8EDE) is the print/preferred value; the PDF
  // separately calls out a "web accessible" shade of the same blue with
  // better contrast, which is what the app actually uses for interactive
  // chrome (buttons, links, focus states).
  blue: "#3E8EDE",
  blueWebAccessible: "#3579BD",
  blueHover: "#2E6BA6",
  bluePress: "#275A8C",

  // Accent
  orange: "#F76B1C",

  // Secondary
  yellow: "#F6D34B",
  green: "#98C11E",

  // Neutrals
  coolGray11: "#6D6E70", // secondary text
  coolGray7: "#9B9EA0", // muted / borders
  neutralBlack: "#4F463D", // primary text — warm near-black, not pure black
};

export const BRAND_FONTS = {
  // "For collateral, event materials, digital, and promotions"
  body: '"Roboto", system-ui, -apple-system, "Segoe UI", sans-serif',
  // "Headlines, subheads, and accent only"
  heading: '"Public Sans", "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif',
};
