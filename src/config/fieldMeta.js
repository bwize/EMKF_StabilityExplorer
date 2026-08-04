// ---------------------------------------------------------------------------
// Field metadata for every RATES indicator computed in Code/01_acs_tracts.py
// (see the RATES dict starting around line 432 of that file).
//
// This is the one file you should need to touch to relabel an indicator,
// move it to a different group, or flip which end of the distribution counts
// as "vulnerable." The app itself never hardcodes a field name — it reads
// this table and only shows the dropdown entries that actually exist as
// fields on the live FeatureLayer (see lib/layerFields.js), so it's safe to
// keep every indicator listed here even before the layer has all of them.
//
// direction:
//   "high"  -> a HIGH value is the vulnerable/worse end (flag the top decile)
//   "low"   -> a LOW value is the vulnerable/worse end (flag the bottom decile)
//   null    -> no clear "worse" direction; shown for context, never flagged
//
// Every RATES field is a 0-100 percent (RATES_AS_PERCENT = True in the
// Python script), so there's a single `decimals` setting rather than a
// per-field format type.
// ---------------------------------------------------------------------------

// Panel/dropdown section order. Deliberately coarse: with the current field
// list these come out at roughly 5/4/3/3 rows, where the older eight-group
// taxonomy left several sections holding a single row and spending more
// vertical space on their own heading than on data. If you uncomment enough
// of FIELD_META below to push a section past ~8 rows, that's the point to
// split it back apart (and to reconsider making the sections collapsible
// again — see TractPanel.jsx).
export const FIELD_GROUPS = [
  "Housing",
  "Economic Security",
  "Mobility & Residential Churn",
  "Education & Access",
];

// Raw counts shown as a summary strip at the top of the tract panel, before
// any of the indicator groups. These are plain counts rather than rates, so
// they're formatted with formatCount and never classified or flagged. Same
// rule as FIELD_META: listing a field here is safe even if the live layer
// doesn't have it — a missing field just renders as "N/A".
export const SUMMARY_FIELDS = [
  {
    id: "total_population",
    label: "Total Population",
    description: "Total population of the tract.",
  },
  {
    id: "total_households",
    label: "Total Households",
    description: "Total occupied households in the tract.",
  },
  {
    id: "renter_occupied",
    label: "Renter-Occupied",
    description: "Occupied housing units whose occupants rent.",
  },
  {
    id: "owner_occupied",
    label: "Owner-Occupied",
    description: "Occupied housing units whose occupants own.",
  },
];

export const FIELD_META = {
  // --- Housing: cost, then stock & conditions ------------------------------
  pct_cost_burden: {
    label: "Cost-Burdened Households",
    group: "Housing",
    direction: "high",
    description: "Renters and owners spending 30%+ of income on housing.",
  },
  // pct_rent_burden: {
  //   label: "Rent-Burdened Renters",
  //   group: "Housing",
  //   direction: "high",
  //   description: "Renters spending 30%+ of income on gross rent.",
  // },
  pct_severe_cost_burden: {
    label: "Severely Cost-Burdened Households",
    group: "Housing",
    direction: "high",
    description: "Renters and owners spending 50%+ of income on housing.",
  },
  // pct_lowinc_cost_burden: {
  //   label: "Cost Burden Among Low-Income Households",
  //   group: "Housing",
  //   direction: "high",
  //   description:
  //     "Of households earning under $35k, the share paying 30%+ of income on housing. Tends to saturate near 100% in many tracts.",
  // },
  pct_hh_lowinc_burdened: {
    label: "Share of All Households Low-Income & Burdened",
    group: "Housing",
    direction: "high",
    description:
      "Of ALL households in the tract, the share that are both under $35k and cost-burdened.",
  },
  // pct_renter_occupied: {
  //   label: "Renter-Occupied Housing",
  //   group: "Housing",
  //   direction: "high",
  //   description: "Share of occupied housing units that are renter- rather than owner-occupied.",
  // },
  pct_vacant: {
    label: "Vacant Housing Units",
    group: "Housing",
    direction: "high",
    description: "Share of all housing units that are vacant.",
  },
  pct_severe_overcrowded: {
    label: "Severely Overcrowded Households",
    group: "Housing",
    direction: "high",
    description: "More than 1.5 occupants per room.",
  },

  // --- Economic security: employment, then income supports -----------------
  // The 16+ employment measures are age-structure sensitive; the prime-age
  // versions below are the ones to prefer, which is why they sit first.
  pct_prime_unemployed: {
    label: "Unemployment Rate (Prime-Age 25–54)",
    group: "Economic Security",
    direction: "high",
    description: "Unemployment rate restricted to the prime working-age population — not distorted by retirees.",
  },
  pct_prime_lfp: {
    label: "Labor Force Participation (Prime-Age)",
    group: "Economic Security",
    direction: "low",
    description: "Labor force participation restricted to ages 25–54.",
  },
  // pct_unemployed: {
  //   label: "Unemployment Rate (16+)",
  //   group: "Economic Security",
  //   direction: "high",
  //   description: "Share of the 16+ civilian labor force that is unemployed.",
  // },
  // pct_labor_force_part: {
  //   label: "Labor Force Participation (16+)",
  //   group: "Economic Security",
  //   direction: "low",
  //   description:
  //     "Share of the population 16+ in the labor force. Includes retirees, so this partly reflects age structure — prefer the prime-age version above when possible.",
  // },
  // pct_emp_pop_ratio: {
  //   label: "Employment-Population Ratio (16+)",
  //   group: "Economic Security",
  //   direction: "low",
  //   description: "Share of the population 16+ that is employed. Also age-structure sensitive.",
  // },
  // pct_below_200_poverty: {
  //   label: "Below 200% of Poverty Line",
  //   group: "Economic Security",
  //   direction: "high",
  //   description: "Population with income below twice the poverty line.",
  // },
  pct_snap_or_pubassist: {
    label: "SNAP / Public Assistance Households",
    group: "Economic Security",
    direction: "high",
    description: "Households receiving SNAP benefits or public cash assistance.",
  },

  // --- Mobility: residential churn, then getting to work -------------------
  pct_renter_moved_recent: {
    label: "Renters Who Moved In (Past Year)",
    group: "Mobility & Residential Churn",
    direction: "high",
    description: "Renter households that moved into their current unit in the past year.",
  },
  // pct_renter_moved_5yr: {
  //   label: "Renters Who Moved In (Since 2020)",
  //   group: "Mobility & Residential Churn",
  //   direction: "high",
  //   description: "Renter households that moved into their current unit since 2020.",
  // },
  // pct_moved_last_year: {
  //   label: "Moved in Past Year (All Households)",
  //   group: "Mobility & Residential Churn",
  //   direction: "high",
  //   description: "All residents 1+ who lived in a different residence one year ago.",
  // },
  pct_moved_within_county: {
    label: "Moved Within County (Past Year)",
    group: "Mobility & Residential Churn",
    direction: "high",
    description: "Residents whose move in the past year was local (same county).",
  },
  pct_no_vehicle: {
    label: "No Vehicle Access",
    group: "Mobility & Residential Churn",
    direction: "high",
    description: "Occupied households with no vehicle available.",
  },
  // pct_commute_gt45: {
  //   label: "Long Commute (45+ min)",
  //   group: "Mobility & Residential Churn",
  //   direction: "high",
  //   description: "Workers 16+ with a one-way commute of 45 minutes or more.",
  // },
  pct_commute_gt15: {
    label: "Commute 15+ Minutes",
    group: "Mobility & Residential Churn",
    direction: "high",
    description: "Workers 16+ with a one-way commute of 15 minutes or more.",
  },

  // --- Education & access --------------------------------------------------
  pct_no_hs_diploma: {
    label: "No High School Diploma (25+)",
    group: "Education & Access",
    direction: "high",
    description: "Population 25+ without a high school diploma or equivalent.",
  },
  // pct_bachelors_plus: {
  //   label: "Bachelor's Degree or Higher (25+)",
  //   group: "Education & Access",
  //   direction: "low",
  //   description: "Population 25+ with a bachelor's degree or higher.",
  // },
  pct_no_internet: {
    label: "No Internet Access",
    group: "Education & Access",
    direction: "high",
    description: "Households with no internet subscription of any kind.",
  },
  pct_limited_english: {
    label: "Limited English-Speaking Households",
    group: "Education & Access",
    direction: "high",
    description: "Households where no member 14+ speaks English \"very well.\"",
  },
};

// Decimal places for displayed percentages.
export const VALUE_DECIMALS = 1;
