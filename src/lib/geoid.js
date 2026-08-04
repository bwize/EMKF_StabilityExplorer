import { COUNTIES_BY_FIPS } from "../config/appConfig.js";

/**
 * Parse an 11-digit Census tract GEOID (SSCCCTTTTTT: 2-digit state,
 * 3-digit county, 6-digit tract) into display-friendly pieces.
 *
 * Tract code formatting follows Census convention: the 6 digits are a
 * 4-digit whole part + 2-digit hundredths suffix, e.g. "050200" -> "502",
 * "030102" -> "301.02".
 */
export function describeTract(geoid) {
  const clean = String(geoid ?? "").padStart(11, "0");
  const stateFips = clean.slice(0, 2);
  const countyFips = clean.slice(2, 5);
  const tractCode = clean.slice(5, 11);

  const whole = parseInt(tractCode.slice(0, 4), 10) || 0;
  const frac = tractCode.slice(4, 6);
  const tractLabel = frac === "00" ? String(whole) : `${whole}.${frac}`;

  return {
    geoid: clean,
    stateFips,
    countyFips,
    county: COUNTIES_BY_FIPS[`${stateFips}${countyFips}`] ?? "Unknown county",
    tractLabel,
  };
}
