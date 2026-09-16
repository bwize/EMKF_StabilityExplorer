// ---------------------------------------------------------------------------
// App-wide configuration. Edit these values freely — nothing else in the app
// should need to change if the service URL, county list, or thresholds move.
// ---------------------------------------------------------------------------

// The hosted tract layer, published from Code/01_acs_tracts.py in the Python
// side of this project (see ../../../../Code/01_acs_tracts.py).
export const FEATURE_LAYER_URL =
  "https://services1.arcgis.com/Qno1QDqHYzSxIvPM/arcgis/rest/services/Stability_Tracts/FeatureServer/0";

// The hosted ZIP (ZCTA) layer, published alongside the tracts in the same
// service with the same ACS fields, and the field holding its 5-digit ZIP.
export const ZIP_LAYER_URL =
  "https://services1.arcgis.com/Qno1QDqHYzSxIvPM/arcgis/rest/services/Stability_Tracts/FeatureServer/1";
export const ZIP_FIELD = "GeoID";

// ZIPs on the hosted layer that the app hides entirely: no outline, not in the
// picker, and left out of the ZIP distributions the panel ranks against.
export const HIDDEN_ZIPS = [
  "64040", "64429", "64671", "64493", "64477", "64085", "64036", "64074",
  "64017", "64465", "64735", "64650", "64019", "64011", "64454", "64448",
  "64076", "64726", "64097", "64084", "64788", "64401", "64637", "64720",
  "66052", "66064", "66020", "66086", "66092", "66007", "66053", "66043",
  "66042", "66027", "66040", "66071", "66002", "66048",
];

// Basemap the map opens on. Users can switch via the basemap gallery in the
// map's top-right corner. A muted basemap is the right default: the tract
// fills are drawn at TRACT_FILL_OPACITY, so a busy or high-contrast basemap
// (imagery especially) competes with the choropleth ramp underneath it.
export const DEFAULT_BASEMAP = "gray-vector";
1
export const APP_TITLE = "Stability Explorer";
export const APP_SUBTITLE = "Indicators by Tract";

// GEOID prefix (state FIPS + county FIPS) -> county display name. Mirrors the
// COUNTIES dict in 01_acs_tracts.py so tract popups can show a real place
// name instead of a raw 11-digit GEOID.
export const COUNTIES_BY_FIPS = {
  "20209": "Wyandotte County, KS",
  "20091": "Johnson County, KS",
  "29165": "Platte County, MO",
  "29047": "Clay County, MO",
  "29095": "Jackson County, MO",
  "29037": "Cass County, MO",
};

// Natural-breaks class count for every choropleth. Must stay equal to the
// number of steps in CHOROPLETH_RAMP (lib/colorRamps.js) — a shorter ramp
// makes classify.js reuse its darkest step for the leftover classes.
export const CLASS_COUNT = 4;

// Alpha applied to every choropleth polygon fill so the gray-vector basemap
// (roads, place labels, water) stays legible underneath. Polygon outlines keep
// their own alpha — see lib/colorRamps.js.
export const TRACT_FILL_OPACITY = 0.75;

// A tract's value on a field is "flagged" when it falls in this share of the
// distribution's worst-off tail (top 10% by default). Direction-aware: see
// lib/stats.js.
export const FLAG_QUANTILE = 0.10;

// The Python "small-sample screen" field. ArcGIS Online auto-renamed it once
// already (exclude -> exclude_1) when the layer was republished, so we check
// both spellings defensively rather than hardcoding one.
export const EXCLUDE_FIELD_CANDIDATES = ["exclude", "exclude_1"];

export const GEOID_FIELD = "GEOID";
